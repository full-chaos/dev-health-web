import { describe, expect, it } from "vitest";

import type { Transport, TransportCall } from "@/lib/auth/authorize/client";
import { AcrRuntimeError, acrRuntimeErrorCodes } from "../errors";
import { resolveRepositoryScopes } from "../grantScopes";

const TOKEN = "header.payload.signature-of-the-session-token";
const ORG = "org-123";

type Verdict = "bare" | "deny" | "org" | { allowlist: readonly string[] };

function decision(verdict: Verdict): Record<string, unknown> {
    const allowed = verdict !== "deny";
    const obligations =
        verdict === "org"
            ? { repository_scope: "organization" }
            : typeof verdict === "object"
              ? { repository_allowlist: verdict.allowlist }
              : undefined;
    return {
        schema_version: "authorization_decision.v1",
        decision_id: "dec_" + "A".repeat(26),
        allowed,
        reason_code: allowed ? "allowed_by_repository_grant" : "grant_absent",
        principal_id: "prn_abc",
        organization_id: ORG,
        policy_revision: 1,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        ...(obligations === undefined ? {} : { obligations }),
    };
}

type Seen = { calls: TransportCall[]; keys: string[] };

function fakeTransport(verdictFor: (key: string) => Verdict): { seen: Seen; transport: Transport } {
    const seen: Seen = { calls: [], keys: [] };
    const transport: Transport = async (call) => {
        seen.calls.push(call);
        const parsed = JSON.parse(call.body) as Record<string, unknown>;
        const requests = (call.path === "/v1/authorize:batch" ? parsed["requests"] : [parsed]) as {
            principal_reference: string;
            action: string;
            resource: Record<string, string>;
        }[];
        for (const r of requests) {
            expect(r.principal_reference).toBe(TOKEN);
            expect(r.action).toBe("acr.context.read");
            expect(r.resource["type"]).toBe("repository");
            expect(r.resource["organization_id"]).toBe(ORG);
            seen.keys.push(r.resource["key"] as string);
        }
        const decisions = requests.map((r) => decision(verdictFor(r.resource["key"] as string)));
        const body =
            call.path === "/v1/authorize:batch"
                ? {
                      schema_version: "authorization_batch_response.v1",
                      decisions: decisions.map((d, index) => ({ index, decision: d })),
                  }
                : decisions[0];
        return { status: 200, body: JSON.stringify(body) };
    };
    return { seen, transport };
}

const input = (candidates: readonly string[]) => ({
    accessToken: TOKEN,
    candidates,
    orgId: ORG,
});

describe("resolveRepositoryScopes", () => {
    it("Given a universal grant, then the scopes are the candidates (one universal ask, no per-repository asks)", async () => {
        const { seen, transport } = fakeTransport(() => "org");
        const result = await resolveRepositoryScopes(input(["a/one", "a/two"]), {
            transport,
            timeoutMs: 1_000,
        });
        expect(result.repositoryScopes).toEqual(["a/one", "a/two"]);
        expect(result.visibleRepositories).toEqual(["a/one", "a/two"]);
        expect(seen.keys).toEqual(["*"]);
    });

    it("Given exact grants only, then only allowed repositories reach the scopes, sorted", async () => {
        const { transport } = fakeTransport((key) =>
            key === "a/three" ? "deny" : key === "*" ? "deny" : "org",
        );
        const result = await resolveRepositoryScopes(input(["a/one", "a/three", "a/two"]), {
            transport,
            timeoutMs: 1_000,
        });
        expect(result.repositoryScopes).toEqual(["a/one", "a/two"]);
        expect(result.visibleRepositories).toEqual(["a/one", "a/two"]);
    });

    it("Given the inventory names X and the PDP denies X, then X is absent", async () => {
        const { transport } = fakeTransport(() => "deny");
        const result = await resolveRepositoryScopes(input(["x/secret"]), {
            transport,
            timeoutMs: 1_000,
        });
        expect(result.repositoryScopes).toEqual([]);
    });

    it("Given a service account with no grant rows, then no scopes", async () => {
        const { transport } = fakeTransport(() => "deny");
        const result = await resolveRepositoryScopes(input(["a/one", "a/two"]), {
            transport,
            timeoutMs: 1_000,
        });
        expect(result).toEqual({ repositoryScopes: [], visibleRepositories: [] });
    });

    it("Given a member with the default grant, then every candidate is allowed by decision", async () => {
        const { transport } = fakeTransport((key) => (key === "*" ? "deny" : "org"));
        const result = await resolveRepositoryScopes(input(["a/one", "a/two"]), {
            transport,
            timeoutMs: 1_000,
        });
        expect(result.repositoryScopes).toEqual(["a/one", "a/two"]);
    });

    it("Given an allow with neither repository_scope nor repository_allowlist on the universal ask, then no key is granted", async () => {
        const { transport } = fakeTransport(() => "bare");
        const result = await resolveRepositoryScopes(input(["a/one", "a/two"]), {
            transport,
            timeoutMs: 1_000,
        });
        expect(result.repositoryScopes).toEqual([]);
        expect(result.visibleRepositories).toEqual([]);
    });

    it("Given a bare allow on each per-repository ask, then no key is granted", async () => {
        const { transport } = fakeTransport((key) => (key === "*" ? "deny" : "bare"));
        const result = await resolveRepositoryScopes(input(["a/one", "a/two"]), {
            transport,
            timeoutMs: 1_000,
        });
        expect(result.repositoryScopes).toEqual([]);
        expect(result.visibleRepositories).toEqual([]);
    });

    it("Given an allow with repository_scope organization on the universal ask, then every candidate is granted with one ask", async () => {
        const { seen, transport } = fakeTransport(() => "org");
        const result = await resolveRepositoryScopes(input(["a/one", "a/two"]), {
            transport,
            timeoutMs: 1_000,
        });
        expect(result.repositoryScopes).toEqual(["a/one", "a/two"]);
        expect(seen.keys).toEqual(["*"]);
    });

    it("Given an allowlist with the wildcard on the universal ask, then every candidate is granted", async () => {
        const { transport } = fakeTransport(() => ({ allowlist: ["*"] }));
        const result = await resolveRepositoryScopes(input(["a/one", "a/two"]), {
            transport,
            timeoutMs: 1_000,
        });
        expect(result.repositoryScopes).toEqual(["a/one", "a/two"]);
    });

    it("Given an allowlist naming one repository on the universal ask, then only that repository is granted", async () => {
        const { transport } = fakeTransport(() => ({ allowlist: ["a/one"] }));
        const result = await resolveRepositoryScopes(input(["a/one", "a/two"]), {
            transport,
            timeoutMs: 1_000,
        });
        expect(result.repositoryScopes).toEqual(["a/one"]);
    });

    it("Given an allow whose allowlist leaves the repository out, then it is not a scope", async () => {
        const { transport } = fakeTransport((key) =>
            key === "*" ? "deny" : { allowlist: ["a/one"] },
        );
        const result = await resolveRepositoryScopes(input(["a/one", "a/two"]), {
            transport,
            timeoutMs: 1_000,
        });
        expect(result.repositoryScopes).toEqual(["a/one"]);
    });

    it("Given 150 candidates, then they are asked in batches of at most 100", async () => {
        const candidates = Array.from(
            { length: 150 },
            (_, i) => `a/r${String(i).padStart(3, "0")}`,
        );
        const { seen, transport } = fakeTransport((key) => (key === "*" ? "deny" : "org"));
        const result = await resolveRepositoryScopes(input(candidates), {
            transport,
            timeoutMs: 1_000,
        });
        expect(result.repositoryScopes).toEqual(candidates);
        const batches = seen.calls.filter((c) => c.path === "/v1/authorize:batch");
        expect(batches).toHaveLength(2);
        expect(
            batches.map((c) => (JSON.parse(c.body) as { requests: unknown[] }).requests.length),
        ).toEqual([100, 50]);
    });

    it("Given a PDP failure on any call, then it refuses and never returns a partial list", async () => {
        const transport: Transport = async () => ({ status: 503, body: "" });
        await expect(
            resolveRepositoryScopes(input(["a/one"]), { transport, timeoutMs: 1_000 }),
        ).rejects.toMatchObject({
            code: acrRuntimeErrorCodes.unavailable,
        });
    });

    it("Given the second batch fails, then it refuses", async () => {
        const candidates = Array.from(
            { length: 101 },
            (_, i) => `a/r${String(i).padStart(3, "0")}`,
        );
        let batches = 0;
        const ok = fakeTransport((key) => (key === "*" ? "deny" : "org")).transport;
        const transport: Transport = async (call) => {
            if (call.path === "/v1/authorize:batch" && ++batches === 2)
                return { status: 500, body: "" };
            return ok(call);
        };
        await expect(
            resolveRepositoryScopes(input(candidates), { transport, timeoutMs: 1_000 }),
        ).rejects.toBeInstanceOf(AcrRuntimeError);
    });

    it("Given no transport is configured, then it refuses (fails closed)", async () => {
        await expect(
            resolveRepositoryScopes(input(["a/one"]), { transport: null, timeoutMs: 1_000 }),
        ).rejects.toMatchObject({
            code: acrRuntimeErrorCodes.unavailable,
        });
    });

    it("Given no candidates and no universal grant, then no batch is sent", async () => {
        const { seen, transport } = fakeTransport(() => "deny");
        const result = await resolveRepositoryScopes(input([]), { transport, timeoutMs: 1_000 });
        expect(result.repositoryScopes).toEqual([]);
        expect(seen.calls.filter((c) => c.path === "/v1/authorize:batch")).toHaveLength(0);
    });
});
