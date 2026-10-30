import { expect, test, type APIRequestContext } from "@playwright/test";
import { ACR_API_ORIGIN, OPS_MOCK_ORIGIN } from "../playwright.context-fabric.config";

/**
 * CHAOS-11923 (plan INV-8): the Ask Dev submission status route reaches its Next handler in the PRODUCTION
 * build, not the Ops rewrite, with a fresh session and entitlement read and a fresh assertion on
 * every call, and a status read sends ACR no POST. Cross-principal denial is read through the same
 * production handler: ACR's one 404 for another principal's result comes back as a 404 with the
 * handler's own shape.
 */
const ROUTE = "/api/ask-dev/submissions";

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

async function count(request: APIRequestContext, path: string): Promise<number> {
    const body = (await (await request.get(`${ACR_API_ORIGIN}${path}`)).json()) as {
        count: number;
    };
    return body.count;
}

test("reads the submission status from the handler: one ACR GET, zero POST, Ops never sees the path", async ({
    page,
    request,
}) => {
    await setEntitlements(request, "ask-dev-enabled");
    await request.post(`${OPS_MOCK_ORIGIN}/__test/backend-log/reset`);
    const posts = await count(request, "/__test/investigation-requests");
    const reads = await count(request, "/__test/submission-reads");

    const response = await page.request.get(`${ROUTE}/3f0c2a3e-8c1d-4b8e-9a53-0d5f2f9a1b11`);

    expect(response.status()).toBe(200);
    const body = (await response.json()) as { schema_version?: string; state?: string };
    expect(body.schema_version).toBe("context_fabric_submission_status.v1");
    expect(body.state).toBe("done");
    expect(response.headers()["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/u);
    expect(await opsSawAskDevPaths(request)).toEqual([]);
    // 0 new reads would mean the handler never reached ACR (the measurement did not happen).
    expect(await count(request, "/__test/submission-reads")).toBe(reads + 1);
    expect(await count(request, "/__test/investigation-requests")).toBe(posts);
});

test("denies a status read when ask_dev is off, from the handler, with no ACR read", async ({
    page,
    request,
}) => {
    await setEntitlements(request, "ask-dev-off");
    const reads = await count(request, "/__test/submission-reads");

    const response = await page.request.get(`${ROUTE}/3f0c2a3e-8c1d-4b8e-9a53-0d5f2f9a1b11`);

    expect(response.status()).toBe(403);
    const body = (await response.json()) as { error: { code: string }; request_id: string };
    expect(body.error.code).toBe("not_entitled");
    expect(body.request_id).toBe(response.headers()["x-request-id"]);
    expect(await count(request, "/__test/submission-reads")).toBe(reads);
});

test("answers another principal's submission with the handler's 404", async ({ page, request }) => {
    await setEntitlements(request, "ask-dev-enabled");
    await request.post(`${OPS_MOCK_ORIGIN}/__test/backend-log/reset`);

    const response = await page.request.get(`${ROUTE}/sub_other_principal`);

    expect(response.status()).toBe(404);
    const body = (await response.json()) as { error: { code: string }; request_id: string };
    expect(body.error.code).toBe("repository_not_available");
    expect(body.request_id).toBe(response.headers()["x-request-id"]);
    expect(JSON.stringify(body)).not.toContain("sub_other_principal");
    expect(await opsSawAskDevPaths(request)).toEqual([]);
});
