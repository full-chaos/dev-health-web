import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { acrRuntimeErrorCodes } from "../errors";
import { resolveOpsAuthorization } from "../ops";

// CHAOS-13332: a deliberate query-api refusal is not an outage and must not invite a retry.
const server = setupServer();
const base = {
    accessToken: "header.payload.signature-of-the-session-token",
    orgId: "org-123",
    signal: new AbortController().signal,
    subject: "user-123",
};

function graphql(respond: () => Response): void {
    server.use(
        http.get("http://ops.example.test/api/v1/licensing/entitlements/:orgId", () =>
            HttpResponse.json({ features: { agent_context_runtime: true }, is_valid: true }),
        ),
        http.post("http://ops.example.test/graphql", respond),
    );
}

describe("readRepositoryScopes non-200 answers", () => {
    beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
    afterAll(() => server.close());
    beforeEach(() => vi.stubEnv("BACKEND_URL", "http://ops.example.test"));
    afterEach(() => {
        server.resetHandlers();
        vi.unstubAllEnvs();
    });

    it.each([401, 403])(
        "Given query-api refuses with %s, then the refusal is not retryable and not unavailable",
        async (status) => {
            graphql(() => HttpResponse.json({ reason: "edge_not_a_member" }, { status }));
            await expect(resolveOpsAuthorization(base)).rejects.toMatchObject({
                code: acrRuntimeErrorCodes.notEntitled,
                retryable: false,
                status: 403,
            });
        },
    );

    it.each([500, 502, 503])(
        "Given query-api answers %s, then it stays a retryable 503 unavailable",
        async (status) => {
            graphql(() => HttpResponse.json({}, { status }));
            await expect(resolveOpsAuthorization(base)).rejects.toMatchObject({
                code: acrRuntimeErrorCodes.unavailable,
                retryable: true,
                status: 503,
            });
        },
    );

    it("Given query-api answers 200 with an unparsable body, then it stays a retryable 503 unavailable", async () => {
        graphql(() => HttpResponse.json({ nope: true }));
        await expect(resolveOpsAuthorization(base)).rejects.toMatchObject({
            code: acrRuntimeErrorCodes.unavailable,
            retryable: true,
            status: 503,
        });
    });

    it.each([401, 403])(
        "Given the entitlement read is refused with %s, then it is a non-retryable refusal",
        async (status) => {
            server.use(
                http.get("http://ops.example.test/api/v1/licensing/entitlements/:orgId", () =>
                    HttpResponse.json({}, { status }),
                ),
            );
            await expect(resolveOpsAuthorization(base)).rejects.toMatchObject({
                code: acrRuntimeErrorCodes.notEntitled,
                retryable: false,
                status: 403,
            });
        },
    );

    it("Given the entitlement read answers 503, then it stays a retryable 503 unavailable", async () => {
        server.use(
            http.get("http://ops.example.test/api/v1/licensing/entitlements/:orgId", () =>
                HttpResponse.json({}, { status: 503 }),
            ),
        );
        await expect(resolveOpsAuthorization(base)).rejects.toMatchObject({
            code: acrRuntimeErrorCodes.unavailable,
            retryable: true,
            status: 503,
        });
    });
});
