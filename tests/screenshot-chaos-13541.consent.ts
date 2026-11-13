/**
 * CHAOS-13541 screenshot spec: the consent page (/acr/authorize) names the 256 repository-grant cap when the
 * acr.credential.issue decision denies repository_allowlist_too_large. Run: playwright test -c playwright.chaos-13541.config.ts
 *
 * ops PDP decision mocked from contracts/auth/v1/examples/authorization_decision/decision-valid-reason-repository-allowlist-too-large.json@0369263d
 *   ops commit 0369263dcc228913de5444508bcee46085e80aa1, copied byte for byte to
 *   tests/fixtures/chaos-13541/decision-valid-reason-repository-allowlist-too-large.json,
 *   sha256 c40393a0fc76de951d0bfaab83a5835fdb5e2c14adb3a621300ec54a7c5331fa (asserted below).
 * Mock layer: the web server's own server-side calls to auth-service (AUTH_INTERNAL_URL = the e2e mock server,
 * tests/mocks/http-server.ts: /internal/v1/token/exchange and /v1/authorize). ACR is never called: the deny
 * refuses the consent before the ACR preview.
 * Residual: the same answer from a real auth-service with a principal over 256 grants is not shown here.
 * Delete this file and playwright.chaos-13541.config.ts after the PR is merged.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
    JWT_TOKEN_TYPE,
    PDP_DECISION_FILE,
    TOKEN_EXCHANGE_GRANT,
    WORKLOAD_AUDIENCE,
    WORKLOAD_SUBJECT_FILE,
} from "./mocks/chaos13541Pdp";

const FIXTURE_SHA256 = "c40393a0fc76de951d0bfaab83a5835fdb5e2c14adb3a621300ec54a7c5331fa";
const CAPTION =
    "ops PDP decision mocked from contracts/auth/v1/examples/authorization_decision/decision-valid-reason-repository-allowlist-too-large.json@0369263d";
const CAP =
    "This account holds more than 256 repository grants in this organization. One credential covers at most 256 repositories.";
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_CHAOS_13541_MOCK_PORT ?? "8014"}`;
const HANDLE = "chaos-13541-consent-handle".padEnd(43, "x");
const OUT = "output/chaos-13541";

const knownRequest = {
    schema_version: "authorization_request.v1",
    principal_reference: "chaos-13541-session-reference",
    action: "acr.credential.issue",
    resource: { type: "organization", key: "org-chaos-13541", organization_id: "org-chaos-13541" },
    context: { request_id: `req_${"a".repeat(26)}`, client_service: "dev-health-web" },
};

test("the mocked decision is the ops example, byte for byte", () => {
    const sha = createHash("sha256").update(readFileSync(PDP_DECISION_FILE)).digest("hex");
    expect(sha).toBe(FIXTURE_SHA256);
});

test("the mock answers the one known shape and refuses a shape it does not know", async ({
    request,
}) => {
    const badExchange = await request.post(`${MOCK}/internal/v1/token/exchange`, {
        form: {
            grant_type: TOKEN_EXCHANGE_GRANT,
            subject_token: readFileSync(WORKLOAD_SUBJECT_FILE, "utf8").trim(),
            subject_token_type: JWT_TOKEN_TYPE,
            audience: "query-api",
        },
    });
    expect(badExchange.status()).toBe(400);

    const exchange = await request.post(`${MOCK}/internal/v1/token/exchange`, {
        form: {
            grant_type: TOKEN_EXCHANGE_GRANT,
            subject_token: readFileSync(WORKLOAD_SUBJECT_FILE, "utf8").trim(),
            subject_token_type: JWT_TOKEN_TYPE,
            audience: WORKLOAD_AUDIENCE,
        },
    });
    expect(exchange.status()).toBe(200);
    const { access_token: token } = (await exchange.json()) as { access_token: string };
    const headers = { Authorization: `Bearer ${token}` };

    const known = await request.post(`${MOCK}/v1/authorize`, { headers, data: knownRequest });
    expect(known.status()).toBe(200);
    expect(Buffer.compare(await known.body(), readFileSync(PDP_DECISION_FILE))).toBe(0);

    const unknownShape = await request.post(`${MOCK}/v1/authorize`, {
        headers,
        data: {
            ...knownRequest,
            action: "acr.context.read",
            resource: { type: "repository", key: "acme/alpha", organization_id: "org-chaos-13541" },
        },
    });
    expect(unknownShape.status()).toBe(400);
    expect(await unknownShape.json()).toEqual({
        error: "invalid_request",
        detail: "/v1/authorize: request shape not known to this mock",
    });

    const noToken = await request.post(`${MOCK}/v1/authorize`, { data: knownRequest });
    expect(noToken.status()).toBe(400);
});

test("the consent page names the 256 cap when the issue decision denies repository_allowlist_too_large", async ({
    page,
}) => {
    test.info().annotations.push({ type: "caption", description: CAPTION });
    await page.goto(`/acr/authorize?handle=${HANDLE}`);

    await expect(page.getByRole("heading", { name: "Too many repository grants" })).toBeVisible();
    await expect(page.getByText(CAP)).toBeVisible();
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/chaos-13541-consent-grant-limit.png`, fullPage: true });
    writeFileSync(`${OUT}/chaos-13541-consent-grant-limit.caption.txt`, `${CAPTION}\n`);
});
