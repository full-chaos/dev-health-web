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

    const NOT_JSON = [
        ["an HTML body", "<html>denied</html>", "text/html"],
        ["a non-JSON body labelled JSON", "not json", "application/json"],
    ] as const;
    const entitlementOk = () =>
        HttpResponse.json({ features: { agent_context_runtime: true }, is_valid: true });

    describe.each(["entitlement", "catalog"] as const)("the %s read", (read) => {
        function answer(status: number, body: string, contentType: string): void {
            const respond = () =>
                new HttpResponse(body, { status, headers: { "Content-Type": contentType } });
            server.use(
                http.get(
                    "http://ops.example.test/api/v1/licensing/entitlements/:orgId",
                    read === "entitlement" ? respond : entitlementOk,
                ),
                http.post("http://ops.example.test/graphql", respond),
            );
        }

        it.each(
            NOT_JSON.flatMap(([name, body, type]) =>
                [401, 403].map((status) => [status, name, body, type] as const),
            ),
        )(
            "Given it is refused %s with %s, then the refusal is not retryable",
            async (status, _name, body, type) => {
                answer(status, body, type);
                await expect(resolveOpsAuthorization(base)).rejects.toMatchObject({
                    code: acrRuntimeErrorCodes.notEntitled,
                    retryable: false,
                    status: 403,
                });
            },
        );

        it.each(
            NOT_JSON.flatMap(([name, body, type]) =>
                [200, 500, 502, 503, 599].map((status) => [status, name, body, type] as const),
            ),
        )(
            "Given it answers %s with %s, then it is a retryable 503 unavailable",
            async (status, _name, body, type) => {
                answer(status, body, type);
                await expect(resolveOpsAuthorization(base)).rejects.toMatchObject({
                    code: acrRuntimeErrorCodes.unavailable,
                    retryable: true,
                    status: 503,
                });
            },
        );
    });

    describe.each(["entitlement", "catalog"] as const)(
        "the %s read, body failures outside the JSON parse (same answer as before the status-first change)",
        (read) => {
            function answer(respond: () => Response): void {
                server.use(
                    http.get(
                        "http://ops.example.test/api/v1/licensing/entitlements/:orgId",
                        read === "entitlement" ? respond : entitlementOk,
                    ),
                    http.post("http://ops.example.test/graphql", respond),
                );
            }

            it("Given a 200 whose Content-Length is over 1 MiB, then it is response_too_large, not retryable", async () => {
                answer(
                    () =>
                        new HttpResponse("{}", {
                            headers: {
                                "Content-Type": "application/json",
                                "Content-Length": "1048577",
                            },
                        }),
                );
                await expect(resolveOpsAuthorization(base)).rejects.toMatchObject({
                    code: acrRuntimeErrorCodes.responseTooLarge,
                    retryable: false,
                    status: 503,
                });
            });

            it("Given a 200 whose body is not UTF-8, then it is a retryable 503 unavailable, as a non-JSON body is", async () => {
                answer(
                    () =>
                        new HttpResponse(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]), {
                            headers: { "Content-Type": "application/json" },
                        }),
                );
                await expect(resolveOpsAuthorization(base)).rejects.toMatchObject({
                    name: "AcrRuntimeError",
                    code: acrRuntimeErrorCodes.unavailable,
                    retryable: true,
                    status: 503,
                });
            });

            it(
                "Given a 200 that streams past 1 MiB with no Content-Length and never ends, then it is response_too_large, not retryable",
                { timeout: 5_000 },
                async () => {
                    answer(() => {
                        const chunk = new Uint8Array(64 * 1_024).fill(0x20);
                        let sent = 0;
                        const body = new ReadableStream<Uint8Array>({
                            pull(controller) {
                                if (sent > 1_048_576) return new Promise<void>(() => undefined);
                                sent += chunk.byteLength;
                                controller.enqueue(chunk);
                                return undefined;
                            },
                        });
                        return new HttpResponse(body, {
                            headers: { "Content-Type": "application/json" },
                        });
                    });
                    await expect(resolveOpsAuthorization(base)).rejects.toMatchObject({
                        code: acrRuntimeErrorCodes.responseTooLarge,
                        retryable: false,
                        status: 503,
                    });
                },
            );
        },
    );

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
