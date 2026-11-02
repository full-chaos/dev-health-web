import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { ACR_API_ORIGIN, BFF_ORIGIN, OPS_MOCK_ORIGIN } from "../playwright.context-fabric.config";

/**
 * CHAOS-12108: the Ask Dev server route is gone, and the browser calls ACR directly. Only
 * `/api/ask-dev/authorize` stays under this prefix. Runs only in the production-build suite
 * (`playwright.context-fabric.config.ts`): the rewrite to Ops is a `proxy.ts` decision, and only a
 * build that runs `proxy.ts` as shipped shows it.
 *
 * "Answers nothing" is read three ways: a 404, no ACR call, and the Ops mock never saw an
 * `/api/ask-dev` request (a rewritten call would have landed there with the user's bearer token).
 */
const ROUTE = "/api/ask-dev/investigations";
const AUTHORIZE = "/api/ask-dev/authorize";
// ACR's own request example, byte for byte: a valid body, so a 404 cannot be a body refusal.
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

test("the removed route answers nothing, with both entitlements on", async ({ page, request }) => {
    await setEntitlements(request, "ask-dev-enabled");
    await request.post(`${OPS_MOCK_ORIGIN}/__test/backend-log/reset`);
    const before = await acrInvestigationCount(request);

    const response = await page.request.post(ROUTE, {
        data: BODY,
        headers: { origin: BFF_ORIGIN },
    });

    expect(response.status()).toBe(404);
    expect(response.headers()["content-type"] ?? "").not.toContain("text/event-stream");
    expect(await opsSawAskDevPaths(request)).toEqual([]);
    expect(await acrInvestigationCount(request)).toBe(before);
});

test("authorize still answers, from its handler and not from Ops", async ({ page, request }) => {
    await setEntitlements(request, "ask-dev-enabled");
    await request.post(`${OPS_MOCK_ORIGIN}/__test/backend-log/reset`);

    // An empty body reaches the handler and stops at its own check, before any ACR call.
    const response = await page.request.post(AUTHORIZE, {
        data: {},
        headers: { origin: BFF_ORIGIN },
    });

    expect(response.status()).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
        "invalid_request",
    );
    expect(await opsSawAskDevPaths(request)).toEqual([]);

    const foreign = await page.request.post(AUTHORIZE, {
        data: {},
        headers: { origin: "https://elsewhere.example" },
    });
    expect(foreign.status()).toBe(403);
});

test("keeps /api/v1/dev blocked", async ({ page, request }) => {
    await setEntitlements(request, "ask-dev-enabled");
    await request.post(`${OPS_MOCK_ORIGIN}/__test/backend-log/reset`);

    const response = await page.request.post("/api/v1/dev/conversations", { data: {} });

    expect(response.status()).toBe(404);
    expect(await opsSawAskDevPaths(request)).toEqual([]);
});
