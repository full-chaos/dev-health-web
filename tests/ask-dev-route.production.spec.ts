import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { ACR_API_ORIGIN, OPS_MOCK_ORIGIN } from "../playwright.context-fabric.config";

/**
 * CHAOS-11921 (plan INV-8): the Ask Dev route family reaches its Next handler in the PRODUCTION
 * build, with a fresh session, entitlement and scope read and a fresh assertion on every call.
 * Runs only in the production-build suite (`playwright.context-fabric.config.ts`): the rewrite
 * to Ops is a `proxy.ts` decision, and only a build that runs `proxy.ts` as shipped shows it.
 *
 * Reaching the handler is read two ways: the answer has the handler's own shape (a request id
 * that equals the `X-Request-ID` header), and the Ops mock never saw an `/api/ask-dev` request
 * (a rewritten call would have landed there with the user's bearer token).
 */
const ROUTE = "/api/ask-dev/investigations";
// ACR's own request example, byte for byte: the route validates the body against the pinned
// schema before it reads any entitlement, so a hand-written body would stop at a 400.
const BODY: unknown = JSON.parse(
    readFileSync(
        join(
            process.cwd(),
            "src/lib/ask-dev/__tests__/captures/context_fabric_investigation_request.v1.json",
        ),
        "utf8",
    ),
);

type BackendEntry = { path: string };

async function setEntitlements(request: APIRequestContext, scenario: string): Promise<void> {
    const response = await request.post(`${OPS_MOCK_ORIGIN}/__test/entitlements`, {
        data: { scenario },
    });
    expect(response.ok()).toBe(true);
}

async function opsSawAskDevPaths(request: APIRequestContext): Promise<string[]> {
    const log = (await (
        await request.get(`${OPS_MOCK_ORIGIN}/__test/backend-log`)
    ).json()) as BackendEntry[];
    return log.filter((entry) => entry.path.startsWith("/api/ask-dev")).map((entry) => entry.path);
}

async function acrInvestigationCount(request: APIRequestContext): Promise<number> {
    const body = (await (
        await request.get(`${ACR_API_ORIGIN}/__test/investigation-requests`)
    ).json()) as { count: number };
    return body.count;
}

test("denies a run when ask_dev is off, from the handler, and calls ACR zero times", async ({
    page,
    request,
}) => {
    await setEntitlements(request, "ask-dev-off");
    await request.post(`${OPS_MOCK_ORIGIN}/__test/backend-log/reset`);
    const before = await acrInvestigationCount(request);

    const response = await page.request.post(ROUTE, { data: BODY });

    expect(response.status()).toBe(403);
    const body = (await response.json()) as { error: { code: string }; request_id: string };
    expect(body.error.code).toBe("not_entitled");
    expect(body.request_id).toBe(response.headers()["x-request-id"]);
    expect(await opsSawAskDevPaths(request)).toEqual([]);
    expect(await acrInvestigationCount(request)).toBe(before);
});

test("streams a run from the handler when both entitlements are on, with a signed assertion to ACR", async ({
    page,
    request,
}) => {
    await setEntitlements(request, "ask-dev-enabled");
    await request.post(`${OPS_MOCK_ORIGIN}/__test/backend-log/reset`);
    const before = await acrInvestigationCount(request);

    const response = await page.request.post(ROUTE, { data: BODY });

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/event-stream");
    const text = await response.text();
    expect(text.startsWith(": keepalive\n\n")).toBe(true);
    expect(text).toContain("event: accepted");
    expect(text).toContain("event: result");
    expect(await opsSawAskDevPaths(request)).toEqual([]);
    // 0 new ACR calls would mean the stream never reached ACR (the measurement did not happen).
    expect(await acrInvestigationCount(request)).toBe(before + 1);
});

test("keeps /api/v1/dev blocked", async ({ page, request }) => {
    await setEntitlements(request, "ask-dev-enabled");
    await request.post(`${OPS_MOCK_ORIGIN}/__test/backend-log/reset`);

    const response = await page.request.post("/api/v1/dev/conversations", { data: {} });

    expect(response.status()).toBe(404);
    expect(await opsSawAskDevPaths(request)).toEqual([]);
});
