import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import type { Transport } from "@/lib/auth/authorize/client";

const transportSeam = vi.hoisted(() => ({ transport: null as Transport | null }));
vi.mock("../authorizeTransport", () => ({ loadAuthorizeTransport: () => transportSeam.transport }));

import { acrRuntimeErrorCodes } from "../errors";
import { resolveOpsAuthorization } from "../ops";

const server = setupServer();
const TOKEN = "header.payload.signature-of-the-session-token";

function installOps(inventory: readonly string[]): void {
    server.use(
        http.get("http://ops.example.test/api/v1/licensing/entitlements/:orgId", () =>
            HttpResponse.json({ features: { agent_context_runtime: true }, is_valid: true }),
        ),
        http.post("http://ops.example.test/graphql", () =>
            HttpResponse.json({
                data: {
                    catalog: {
                        __typename: "CatalogResult",
                        values: inventory.map((value) => ({
                            __typename: "CatalogValueItem",
                            count: 1,
                            value,
                        })),
                    },
                },
            }),
        ),
    );
}

function pdp(allowed: (key: string) => boolean): Transport {
    return async (call) => {
        const parsed = JSON.parse(call.body) as Record<string, unknown>;
        const requests = (call.path === "/v1/authorize:batch" ? parsed["requests"] : [parsed]) as {
            resource: { key: string };
        }[];
        const decisions = requests.map((r) => {
            const ok = allowed(r.resource.key);
            return {
                schema_version: "authorization_decision.v1",
                decision_id: "dec_" + "A".repeat(26),
                allowed: ok,
                reason_code: ok ? "allowed_by_repository_grant" : "grant_absent",
                principal_id: "prn_abc",
                organization_id: "org-123",
                policy_revision: 1,
                expires_at: new Date(Date.now() + 60_000).toISOString(),
                ...(ok ? { obligations: { repository_scope: "organization" } } : {}),
            };
        });
        const body =
            call.path === "/v1/authorize:batch"
                ? {
                      schema_version: "authorization_batch_response.v1",
                      decisions: decisions.map((decision, index) => ({ index, decision })),
                  }
                : decisions[0];
        return { status: 200, body: JSON.stringify(body) };
    };
}

const base = {
    accessToken: TOKEN,
    orgId: "org-123",
    signal: new AbortController().signal,
    subject: "user-123",
};

describe("resolveOpsAuthorization with ACR_SCOPES_FROM_GRANTS", () => {
    beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
    afterAll(() => server.close());
    beforeEach(() => {
        vi.stubEnv("BACKEND_URL", "http://ops.example.test");
        transportSeam.transport = null;
    });
    afterEach(() => {
        server.resetHandlers();
        vi.unstubAllEnvs();
    });

    it("Given the switch is off, then the catalog is the source and no PDP call is made", async () => {
        installOps(["a/one", "a/two"]);
        const result = await resolveOpsAuthorization(base);
        expect(result.repositoryScopes).toEqual(["a/one", "a/two"]);
    });

    it("Given the switch is on, then only PDP-allowed repositories are scopes", async () => {
        vi.stubEnv("ACR_SCOPES_FROM_GRANTS", "true");
        installOps(["a/one", "a/two"]);
        transportSeam.transport = pdp((key) => key === "a/two");
        const result = await resolveOpsAuthorization(base);
        expect(result.repositoryScopes).toEqual(["a/two"]);
    });

    it("Given the switch is on and the PDP denies the selected repository, then it is not available", async () => {
        vi.stubEnv("ACR_SCOPES_FROM_GRANTS", "true");
        installOps(["a/one", "a/two"]);
        transportSeam.transport = pdp((key) => key === "a/two");
        await expect(
            resolveOpsAuthorization({ ...base, selectedRepository: "a/one" }),
        ).rejects.toMatchObject({
            code: acrRuntimeErrorCodes.repositoryNotAvailable,
        });
    });

    it("Given a catalog that carries a nested repository key, then it is a scope; a 21-segment name refuses 503", async () => {
        installOps(["a/one", "group/subgroup/repo"]);
        const ok = await resolveOpsAuthorization(base);
        expect(ok.repositoryScopes).toEqual(["a/one", "group/subgroup/repo"]);
        installOps(["a/one", "g/".repeat(20) + "x"]);
        await expect(resolveOpsAuthorization(base)).rejects.toMatchObject({
            code: acrRuntimeErrorCodes.unavailable,
        });
        installOps(["alpha"]);
        await expect(resolveOpsAuthorization(base)).rejects.toMatchObject({
            code: acrRuntimeErrorCodes.unavailable,
        });
    });

    it("Given the switch is on and a universal grant, then scopes are every inventory repository and any of them can be selected", async () => {
        vi.stubEnv("ACR_SCOPES_FROM_GRANTS", "true");
        installOps(["a/one", "a/two"]);
        transportSeam.transport = pdp(() => true);
        const result = await resolveOpsAuthorization({ ...base, selectedRepository: "a/one" });
        expect(result.repositoryScopes).toEqual(["a/one", "a/two"]);
        expect(result.visibleRepositories).toEqual(["a/one", "a/two"]);
    });

    // Scope parity (CHAOS-13323, acp condition 1): for every caller class the PDP admits on the
    // universal key (viewer, member, admin and owner hold acr.context.read; a platform admin with no
    // membership row gets the legacy answer, rule 1), the scopes from grants are the legacy catalog
    // scopes byte for byte, and so is the visible list. A smaller set would be a narrowing.
    it.each(["viewer", "member", "admin", "owner", "platform admin with no membership row"])(
        "Given the switch is on and the PDP admits %s on the universal key, then the scopes equal the legacy scopes byte for byte",
        async () => {
            const inventory = ["a/one", "a/two", "b/zeta"];
            installOps(inventory);
            const legacy = await resolveOpsAuthorization(base);
            vi.stubEnv("ACR_SCOPES_FROM_GRANTS", "true");
            transportSeam.transport = pdp(() => true);
            const fromGrants = await resolveOpsAuthorization(base);
            expect(JSON.stringify(fromGrants.repositoryScopes)).toBe(
                JSON.stringify(legacy.repositoryScopes),
            );
            expect(JSON.stringify(fromGrants.visibleRepositories)).toBe(
                JSON.stringify(legacy.visibleRepositories),
            );
        },
    );

    // Legacy refuses a platform admin with no membership row in its token's organization: the catalog read
    // answers 401 (query-api edge auth) and web answers 403 not_entitled, not retryable (ops.ts readRepositoryScopes).
    // With the switch on the same catalog read runs first, so the refusal is the same, byte for byte, and no
    // decision is asked.
    it("Given the catalog read is refused, then both paths refuse with the same error and no decision is asked", async () => {
        server.use(
            http.get("http://ops.example.test/api/v1/licensing/entitlements/:orgId", () =>
                HttpResponse.json({ features: { agent_context_runtime: true }, is_valid: true }),
            ),
            http.post("http://ops.example.test/graphql", () =>
                HttpResponse.json({ error: "unauthorized" }, { status: 401 }),
            ),
        );
        const refusal = async () => {
            try {
                await resolveOpsAuthorization(base);
            } catch (error) {
                const e = error as {
                    code?: unknown;
                    message?: unknown;
                    retryable?: unknown;
                    status?: unknown;
                };
                return JSON.stringify({
                    code: e.code,
                    message: e.message,
                    retryable: e.retryable,
                    status: e.status,
                });
            }
            throw new Error("the catalog refusal did not refuse");
        };
        const legacy = await refusal();
        vi.stubEnv("ACR_SCOPES_FROM_GRANTS", "true");
        let decisions = 0;
        const allowAll = pdp(() => true);
        transportSeam.transport = async (call) => {
            decisions += 1;
            return allowAll(call);
        };
        const fromGrants = await refusal();
        expect(fromGrants).toBe(legacy);
        expect(legacy).toBe(
            JSON.stringify({
                code: acrRuntimeErrorCodes.notEntitled,
                message: "Agent Context Runtime is not available for this organization.",
                retryable: false,
                status: 403,
            }),
        );
        expect(decisions).toBe(0);
    });

    it("Given the switch is on and no transport, then it refuses instead of falling back to the catalog", async () => {
        vi.stubEnv("ACR_SCOPES_FROM_GRANTS", "true");
        installOps(["a/one"]);
        await expect(resolveOpsAuthorization(base)).rejects.toMatchObject({
            code: acrRuntimeErrorCodes.unavailable,
        });
    });
});
