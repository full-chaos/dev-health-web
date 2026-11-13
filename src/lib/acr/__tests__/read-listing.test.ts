import { appendFileSync } from "node:fs";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import type { Transport } from "@/lib/auth/authorize/client";

const seam = vi.hoisted(() => ({
    logs: [] as { fields: Record<string, unknown>; message: string }[],
    transport: null as Transport | null,
}));
vi.mock("../authorizeTransport", () => ({ loadAuthorizeTransport: () => seam.transport }));
vi.mock("@/lib/logger", () => ({
    logger: {
        info: (fields: Record<string, unknown>, message: string) =>
            seam.logs.push({ fields, message }),
        warn: (fields: Record<string, unknown>, message: string) =>
            seam.logs.push({ fields, message }),
        error: vi.fn(),
    },
}));

import { acrRuntimeErrorCodes } from "../errors";
import { resolveOpsAuthorization } from "../ops";

type Reader = "org-wide admin" | "named reader" | "no-grant user";
const READERS: readonly Reader[] = ["org-wide admin", "named reader", "no-grant user"];
const SIZES = [3, 99, 100, 105, 256, 257] as const;
const CAP = 256;
const TOKEN = "header.payload.signature-of-the-session-token";
const server = setupServer();

const repo = (index: number) => `acme/repo-${String(index).padStart(3, "0")}`;
const repos = (count: number) => Array.from({ length: count }, (_, index) => repo(index));

// The catalog as ops serves it: above 100 repositories it answers HTTP 200 with a GraphQL error (repro 2).
function installOps(count: number, catalogReads: { n: number }): void {
    server.use(
        http.get("http://ops.example.test/api/v1/licensing/entitlements/:orgId", () =>
            HttpResponse.json({ features: { agent_context_runtime: true }, is_valid: true }),
        ),
        http.post("http://ops.example.test/graphql", () => {
            catalogReads.n += 1;
            if (count > 100) {
                return HttpResponse.json({
                    data: null,
                    errors: [{ message: "Internal Server Error", path: ["catalog"] }],
                });
            }
            return HttpResponse.json({
                data: {
                    catalog: {
                        __typename: "CatalogResult",
                        values: repos(count).map((value) => ({ count: 1, value })),
                    },
                },
            });
        }),
    );
}

// The listing route as ops answers it (CHAOS-13542): org-wide, the principal's own keys, the cap deny, no access.
function listing(
    reader: Reader,
    count: number,
    asked: { path: string; action: string }[],
): Transport {
    return async (call) => {
        const body = JSON.parse(call.body) as { action: string; resource: { key: string } };
        asked.push({ action: body.action, path: call.path });
        const base = {
            schema_version: "authorization_decision.v1",
            decision_id: "dec_" + "A".repeat(26),
            organization_id: "org-123",
            policy_revision: 1,
            principal_id: "prn_abc",
            expires_at: new Date(Date.now() + 60_000).toISOString(),
        };
        let doc: Record<string, unknown>;
        if (call.path !== "/v1/authorize:repositories") {
            doc = { ...base, allowed: false, reason_code: "invalid_request" };
        } else if (reader === "org-wide admin") {
            doc = {
                ...base,
                allowed: true,
                reason_code: "allowed_by_membership_default",
                obligations: { tenant_scope: "org-123", repository_scope: "organization" },
            };
        } else if (reader === "no-grant user") {
            doc = { ...base, allowed: false, reason_code: "grant_absent" };
        } else if (count > CAP) {
            doc = { ...base, allowed: false, reason_code: "repository_allowlist_too_large" };
        } else {
            doc = {
                ...base,
                allowed: true,
                reason_code: "allowed_by_repository_grant",
                obligations: { tenant_scope: "org-123", repository_allowlist: repos(count) },
            };
        }
        return { status: 200, body: JSON.stringify(doc) };
    };
}

const input = (read: "context" | "evidence", selectedRepository?: string) => ({
    accessToken: TOKEN,
    orgId: "org-123",
    read,
    signal: new AbortController().signal,
    subject: "user-123",
    ...(selectedRepository === undefined ? {} : { selectedRepository }),
});

const cell = (
    sw: string,
    reader: Reader | "impersonating reader",
    count: number,
    result: string,
    log: string,
): void => {
    if (process.env.CELL_LOG)
        appendFileSync(
            process.env.CELL_LOG,
            `CELL switch=${sw} reader="${reader}" repos=${count} -> ${result} | log: ${log}` + "\n",
        );
};

describe("web read path: the ops read listing", () => {
    beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
    afterAll(() => server.close());
    beforeEach(() => {
        vi.stubEnv("BACKEND_URL", "http://ops.example.test");
        seam.logs = [];
        seam.transport = null;
    });
    afterEach(() => {
        server.resetHandlers();
        vi.unstubAllEnvs();
    });

    describe("ACR_SCOPES_FROM_GRANTS off: the catalog, unchanged", () => {
        it.each(SIZES)("a %i-repository org", async (count) => {
            const catalogReads = { n: 0 };
            installOps(count, catalogReads);
            for (const reader of READERS) {
                seam.logs = [];
                if (count > 100) {
                    await expect(resolveOpsAuthorization(input("context"))).rejects.toMatchObject({
                        code: acrRuntimeErrorCodes.unavailable,
                        status: 503,
                    });
                    const line = seam.logs.find(
                        (entry) => entry.fields["module"] === "acr-catalog",
                    );
                    expect(line?.fields).toMatchObject({
                        graphqlMessage: "Internal Server Error",
                        reason: "catalog_unreadable",
                        status: 200,
                    });
                    cell("off", reader, count, "503 unavailable", JSON.stringify(line?.fields));
                } else {
                    const result = await resolveOpsAuthorization(input("context"));
                    expect(result.repositoryScopes).toEqual(repos(count));
                    cell(
                        "off",
                        reader,
                        count,
                        `200 scopes=${result.repositoryScopes.length}`,
                        "none",
                    );
                }
            }
        });
    });

    describe("ACR_SCOPES_FROM_GRANTS on: the listing, no catalog read", () => {
        beforeEach(() => vi.stubEnv("ACR_SCOPES_FROM_GRANTS", "true"));

        it.each(SIZES)("a %i-repository org, context and evidence reads", async (count) => {
            for (const read of ["context", "evidence"] as const) {
                for (const reader of READERS) {
                    const catalogReads = { n: 0 };
                    const asked: { path: string; action: string }[] = [];
                    installOps(count, catalogReads);
                    seam.transport = listing(reader, count, asked);
                    seam.logs = [];
                    const selected = repo(0);
                    const run = resolveOpsAuthorization(input(read, selected));
                    let outcome: string;
                    if (reader === "org-wide admin") {
                        const result = await run;
                        expect(result.repositoryScopes).toEqual(["*"]);
                        outcome = "200 scopes=[*]";
                    } else if (reader === "named reader" && count <= CAP) {
                        const result = await run;
                        expect(result.repositoryScopes).toEqual(repos(count));
                        outcome = `200 scopes=${count} own keys`;
                    } else if (reader === "named reader") {
                        await expect(run).rejects.toMatchObject({
                            code: acrRuntimeErrorCodes.grantLimitExceeded,
                            status: 403,
                        });
                        outcome = "403 grant_limit_exceeded";
                    } else {
                        await expect(run).rejects.toMatchObject({
                            code: acrRuntimeErrorCodes.repositoryNotAvailable,
                            status: 404,
                        });
                        outcome = "404 repository_not_available";
                    }
                    expect(catalogReads.n).toBe(0);
                    expect(asked).toEqual([
                        {
                            action: read === "evidence" ? "acr.evidence.read" : "acr.context.read",
                            path: "/v1/authorize:repositories",
                        },
                    ]);
                    cell(
                        `on/${read}`,
                        reader,
                        count,
                        outcome,
                        seam.logs.map((entry) => entry.message).join(" ; "),
                    );
                }
            }
        });

        it("the cap deny logs one warn line with its reason", async () => {
            installOps(257, { n: 0 });
            seam.transport = listing("named reader", 257, []);
            await expect(resolveOpsAuthorization(input("context"))).rejects.toMatchObject({
                code: acrRuntimeErrorCodes.grantLimitExceeded,
            });
            expect(
                seam.logs.some(
                    (entry) =>
                        entry.fields["module"] === "acr-read-listing" &&
                        entry.fields["reason"] === "repository_allowlist_too_large",
                ),
            ).toBe(true);
        });

        it.each([
            ["a listing that answers 503", async () => ({ status: 503, body: "{}" }), "non_200"],
            [
                "a listing route that is not mounted",
                async () => ({ status: 404, body: "{}" }),
                "non_200",
            ],
            [
                "a transport that fails",
                async () => {
                    throw new Error("down");
                },
                "transport_error",
            ],
            [
                "a deny that is not an access answer",
                async () => ({
                    status: 200,
                    body: JSON.stringify({
                        schema_version: "authorization_decision.v1",
                        decision_id: "dec_" + "A".repeat(26),
                        allowed: false,
                        reason_code: "workload_audience_denied",
                        principal_id: "prn_abc",
                        organization_id: "org-123",
                        policy_revision: 1,
                        expires_at: new Date(Date.now() + 60_000).toISOString(),
                    }),
                }),
                "workload_audience_denied",
            ],
        ] as const)(
            "%s refuses 503 unavailable, with its reason in the log, never a catalog read",
            async (_name, transport, reason) => {
                const catalogReads = { n: 0 };
                installOps(105, catalogReads);
                seam.transport = transport as Transport;
                await expect(resolveOpsAuthorization(input("context"))).rejects.toMatchObject({
                    code: acrRuntimeErrorCodes.unavailable,
                    status: 503,
                });
                expect(catalogReads.n).toBe(0);
                const line = seam.logs.find(
                    (entry) => entry.fields["module"] === "acr-read-listing",
                );
                expect(line?.fields).toMatchObject({ reason, route: "context" });
                expect(
                    seam.logs.filter((entry) => entry.fields["module"] === "acr-read-listing"),
                ).toHaveLength(1);
            },
        );

        it("no transport refuses 503 and never falls back to the catalog", async () => {
            const catalogReads = { n: 0 };
            installOps(3, catalogReads);
            await expect(resolveOpsAuthorization(input("context"))).rejects.toMatchObject({
                code: acrRuntimeErrorCodes.unavailable,
            });
            expect(catalogReads.n).toBe(0);
        });

        it("an allow with neither scope member grants nothing", async () => {
            installOps(3, { n: 0 });
            seam.transport = async () => ({
                status: 200,
                body: JSON.stringify({
                    schema_version: "authorization_decision.v1",
                    decision_id: "dec_" + "A".repeat(26),
                    allowed: true,
                    reason_code: "allowed_by_role",
                    principal_id: "prn_abc",
                    organization_id: "org-123",
                    policy_revision: 1,
                    expires_at: new Date(Date.now() + 60_000).toISOString(),
                }),
            });
            const result = await resolveOpsAuthorization(input("context"));
            expect(result.repositoryScopes).toEqual([]);
        });

        it("a no-access reader with no selected repository gets empty scopes", async () => {
            installOps(3, { n: 0 });
            seam.transport = listing("no-grant user", 3, []);
            const result = await resolveOpsAuthorization(input("context"));
            expect(result.repositoryScopes).toEqual([]);
        });

        describe("an impersonating reader (token with an act claim) is answered as the per-key path answers it", () => {
            const IMPERSONATED = "header.payload.impersonated-token-with-act-claim";
            type Mode = "org-wide" | "impersonation_denied";

            function pdp(mode: Mode, asked: { action: string; path: string; token: string }[]) {
                const base = {
                    schema_version: "authorization_decision.v1",
                    organization_id: "org-123",
                    policy_revision: 1,
                    principal_id: "prn_abc",
                    expires_at: new Date(Date.now() + 60_000).toISOString(),
                };
                const one = (): Record<string, unknown> =>
                    mode === "org-wide"
                        ? {
                              ...base,
                              decision_id: "dec_" + "A".repeat(26),
                              allowed: true,
                              reason_code: "allowed_by_membership_default",
                              obligations: {
                                  tenant_scope: "org-123",
                                  repository_scope: "organization",
                              },
                          }
                        : {
                              ...base,
                              decision_id: "dec_" + "A".repeat(26),
                              allowed: false,
                              reason_code: "impersonation_denied",
                          };
                const transport: Transport = async (call) => {
                    const body = JSON.parse(call.body) as {
                        action?: string;
                        principal?: { reference?: string; access_token?: string };
                        requests?: { action: string }[];
                    };
                    const actions = body.requests?.map((r) => r.action) ?? [body.action ?? ""];
                    for (const action of actions) {
                        asked.push({
                            action,
                            path: call.path,
                            token: call.body.includes(IMPERSONATED) ? "own" : "other",
                        });
                    }
                    if (call.path === "/v1/authorize:batch") {
                        return {
                            status: 200,
                            body: JSON.stringify({
                                schema_version: "authorization_batch_response.v1",
                                decisions: (body.requests ?? []).map((_, index) => ({
                                    decision: one(),
                                    index,
                                })),
                            }),
                        };
                    }
                    return { status: 200, body: JSON.stringify(one()) };
                };
                return transport;
            }

            it.each(["context", "evidence"] as const)(
                "org-wide allow, %s read: ON listing = ['*'] of the same set the per-key path allows; read action only, never credential.issue",
                async (read) => {
                    const action = read === "evidence" ? "acr.evidence.read" : "acr.context.read";
                    installOps(3, { n: 0 });
                    const perKey: { action: string; path: string; token: string }[] = [];
                    seam.transport = pdp("org-wide", perKey);
                    const legacy = await resolveOpsAuthorization({
                        ...input(read),
                        accessToken: IMPERSONATED,
                        read: undefined,
                    });
                    const listed: { action: string; path: string; token: string }[] = [];
                    seam.transport = pdp("org-wide", listed);
                    const result = await resolveOpsAuthorization({
                        ...input(read),
                        accessToken: IMPERSONATED,
                    });
                    expect(legacy.repositoryScopes).toEqual(repos(3));
                    expect(result.repositoryScopes).toEqual(["*"]);
                    expect(listed).toEqual([
                        { action, path: "/v1/authorize:repositories", token: "own" },
                    ]);
                    expect(listed.some((c) => c.action === "acr.credential.issue")).toBe(false);
                    expect(perKey.some((c) => c.action === "acr.credential.issue")).toBe(false);
                    cell(
                        `on/${read}`,
                        "impersonating reader",
                        3,
                        "200 scopes=[*] (per-key: 3 names)",
                        "none",
                    );
                },
            );

            it.each(["context", "evidence"] as const)(
                "impersonation_denied, %s read: same refusal as the per-key path (empty scopes; selected repository 404), no 503",
                async (read) => {
                    installOps(3, { n: 0 });
                    seam.transport = pdp("impersonation_denied", []);
                    const legacy = await resolveOpsAuthorization({
                        ...input(read),
                        accessToken: IMPERSONATED,
                        read: undefined,
                    });
                    const listed = await resolveOpsAuthorization({
                        ...input(read),
                        accessToken: IMPERSONATED,
                    });
                    expect(legacy.repositoryScopes).toEqual([]);
                    expect(listed.repositoryScopes).toEqual(legacy.repositoryScopes);
                    for (const run of [
                        resolveOpsAuthorization({
                            ...input(read, repo(0)),
                            accessToken: IMPERSONATED,
                            read: undefined,
                        }),
                        resolveOpsAuthorization({
                            ...input(read, repo(0)),
                            accessToken: IMPERSONATED,
                        }),
                    ]) {
                        await expect(run).rejects.toMatchObject({
                            code: acrRuntimeErrorCodes.repositoryNotAvailable,
                            status: 404,
                        });
                    }
                    cell(
                        `on/${read}`,
                        "impersonating reader",
                        3,
                        "empty scopes / 404 (same as per-key)",
                        "none",
                    );
                },
            );
        });

        it("a named reader selecting a repository outside the list gets 404", async () => {
            installOps(3, { n: 0 });
            seam.transport = listing("named reader", 3, []);
            await expect(
                resolveOpsAuthorization(input("context", "acme/other")),
            ).rejects.toMatchObject({ code: acrRuntimeErrorCodes.repositoryNotAvailable });
        });
    });
});
