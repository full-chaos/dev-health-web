import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorize, authorizeBatch } from "../client";
import type { AuthorizeRequest } from "../request";

const BASE = "https://auth-internal.example.test:8097";
const TOKEN = "wl-canary-AAAA.wl-canary-BBBB.wl-canary-CCCC";
const SESSION = "prf_EXAMPLE0000000000000001";
const FUTURE = "2999-06-01T00:00:00Z";

const tokenSource = vi.fn<() => Promise<string | undefined>>();
vi.mock("@/lib/auth/workload/token", () => ({
    getWorkloadToken: () => tokenSource(),
    workloadTokenConfigured: () => true,
}));

const REQ: AuthorizeRequest = {
    principalReference: SESSION,
    action: "acr.context.read",
    resource: {
        type: "repository",
        key: "full-chaos/dev-health-ops",
        organizationId: "org_EXAMPLE0000000000000001",
    },
    requestId: "req_EXAMPLE0000000000000000001",
};

const decision = (over: Record<string, unknown> = {}) => ({
    schema_version: "authorization_decision.v1",
    decision_id: "dec_EXAMPLE0000000000000000001",
    allowed: true,
    reason_code: "allowed_by_repository_grant",
    principal_id: "prn_EXAMPLE0000000000000001",
    organization_id: "org_EXAMPLE0000000000000001",
    policy_revision: 42,
    expires_at: FUTURE,
    ...over,
});
const batch = (n: number) =>
    JSON.stringify({
        schema_version: "authorization_batch_response.v1",
        decisions: Array.from({ length: n }, (_, index) => ({ index, decision: decision() })),
    });

let fetchMock: ReturnType<typeof vi.fn>;

async function load() {
    vi.resetModules();
    return import("../transport");
}
const ok = (body: string, status = 200) => new Response(body, { status });

beforeEach(() => {
    tokenSource.mockReset();
    tokenSource.mockResolvedValue(TOKEN);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("AUTH_INTERNAL_URL", `${BASE}/`);
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("authorize transport request", () => {
    it("sends the workload token as bearer, the call path, the body unchanged", async () => {
        fetchMock.mockResolvedValue(ok("{}"));
        const { createAuthorizeTransport } = await load();
        const body = '{"a":1, "b" : [ 2 ]}';
        const reply = await createAuthorizeTransport()({ path: "/v1/authorize", body });
        expect(reply).toEqual({ status: 200, body: "{}" });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(`${BASE}/v1/authorize`);
        expect(init.method).toBe("POST");
        expect(init.body).toBe(body);
        const h = init.headers as Record<string, string>;
        expect(h.Authorization).toBe(`Bearer ${TOKEN}`);
        expect(h["Content-Type"]).toBe("application/json");
        expect(init.redirect).toBe("error");
        expect(init.cache).toBe("no-store");
        expect(init.signal).toBeInstanceOf(AbortSignal);
    });
    it("uses the batch path from the call", async () => {
        fetchMock.mockResolvedValue(ok("{}"));
        const { createAuthorizeTransport } = await load();
        await createAuthorizeTransport()({ path: "/v1/authorize:batch", body: "{}" });
        expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/v1/authorize:batch`);
    });
    it("keeps the session token in the body only, never in a header", async () => {
        fetchMock.mockResolvedValue(ok(JSON.stringify(decision())));
        const { createAuthorizeTransport } = await load();
        await authorize(REQ, { transport: createAuthorizeTransport(), timeoutMs: 1000 });
        const init = fetchMock.mock.calls[0][1] as RequestInit;
        expect(String(init.body)).toContain(SESSION);
        expect(JSON.stringify(init.headers)).not.toContain(SESSION);
        expect(Object.keys(init.headers as object).sort()).toEqual([
            "Accept",
            "Authorization",
            "Content-Type",
        ]);
    });
});

describe("no token, no request", () => {
    it("token source throws: 0 fetch calls, client denies transport_error", async () => {
        tokenSource.mockRejectedValue(new Error("boom"));
        const { createAuthorizeTransport } = await load();
        const out = await authorize(REQ, {
            transport: createAuthorizeTransport(),
            timeoutMs: 1000,
        });
        expect(fetchMock).toHaveBeenCalledTimes(0);
        expect(out).toEqual({ allowed: false, source: "client", reason: "transport_error" });
    });
    it("token source undefined: 0 fetch calls, client denies transport_error", async () => {
        tokenSource.mockResolvedValue(undefined);
        const { createAuthorizeTransport } = await load();
        const out = await authorize(REQ, {
            transport: createAuthorizeTransport(),
            timeoutMs: 1000,
        });
        expect(fetchMock).toHaveBeenCalledTimes(0);
        expect(out).toEqual({ allowed: false, source: "client", reason: "transport_error" });
    });
    it("same for the batch path", async () => {
        tokenSource.mockRejectedValue(new Error("boom"));
        const { createAuthorizeTransport } = await load();
        const out = await authorizeBatch([REQ, REQ], {
            transport: createAuthorizeTransport(),
            timeoutMs: 1000,
        });
        expect(fetchMock).toHaveBeenCalledTimes(0);
        expect(out.map((o) => !o.allowed && o.source === "client" && o.reason)).toEqual([
            "transport_error",
            "transport_error",
        ]);
    });
});

describe("failures are denies", () => {
    it("a redirect is refused (redirect: error), client denies transport_error", async () => {
        fetchMock.mockImplementation(async (_u: string, init: RequestInit) => {
            if (init.redirect === "error") throw new TypeError("redirect mode is set to error");
            return new Response(null, { status: 302, headers: { location: "https://evil.test/" } });
        });
        const { createAuthorizeTransport } = await load();
        const out = await authorize(REQ, {
            transport: createAuthorizeTransport(),
            timeoutMs: 1000,
        });
        expect(out).toEqual({ allowed: false, source: "client", reason: "transport_error" });
    });
    it("a network error is transport_error", async () => {
        fetchMock.mockRejectedValue(new TypeError("fetch failed"));
        const { createAuthorizeTransport } = await load();
        const out = await authorize(REQ, {
            transport: createAuthorizeTransport(),
            timeoutMs: 1000,
        });
        expect(out).toEqual({ allowed: false, source: "client", reason: "transport_error" });
    });
    it("a non-200 passes through and the client denies non_200", async () => {
        fetchMock.mockResolvedValue(ok("nope", 503));
        const { createAuthorizeTransport } = await load();
        const reply = await createAuthorizeTransport()({ path: "/v1/authorize", body: "{}" });
        expect(reply.status).toBe(503);
        const out = await authorize(REQ, {
            transport: createAuthorizeTransport(),
            timeoutMs: 1000,
        });
        expect(out).toEqual({ allowed: false, source: "client", reason: "non_200" });
    });
    it("an oversize answer throws (deny)", async () => {
        fetchMock.mockResolvedValue(ok("x".repeat(1_100_000)));
        const { createAuthorizeTransport } = await load();
        await expect(
            createAuthorizeTransport()({ path: "/v1/authorize", body: "{}" }),
        ).rejects.toThrow();
    });
    it("a malformed answer is a deny", async () => {
        fetchMock.mockResolvedValue(ok("not json"));
        const { createAuthorizeTransport } = await load();
        const out = await authorize(REQ, {
            transport: createAuthorizeTransport(),
            timeoutMs: 1000,
        });
        expect(out.allowed).toBe(false);
    });
    it("does not retry", async () => {
        fetchMock.mockRejectedValue(new TypeError("fetch failed"));
        const { createAuthorizeTransport } = await load();
        await authorize(REQ, { transport: createAuthorizeTransport(), timeoutMs: 1000 });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe("end to end with a fake fetch", () => {
    it("allows on a valid PDP answer", async () => {
        fetchMock.mockResolvedValue(ok(JSON.stringify(decision())));
        const { createAuthorizeTransport } = await load();
        const out = await authorize(REQ, {
            transport: createAuthorizeTransport(),
            timeoutMs: 1000,
        });
        expect(out.allowed).toBe(true);
    });
    it("allows a batch on a valid PDP answer", async () => {
        fetchMock.mockResolvedValue(ok(batch(2)));
        const { createAuthorizeTransport } = await load();
        const out = await authorizeBatch([REQ, REQ], {
            transport: createAuthorizeTransport(),
            timeoutMs: 1000,
        });
        expect(out.map((o) => o.allowed)).toEqual([true, true]);
        expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/v1/authorize:batch`);
    });
    it("denies a PDP deny", async () => {
        fetchMock.mockResolvedValue(
            ok(JSON.stringify(decision({ allowed: false, reason_code: "denied_no_role" }))),
        );
        const { createAuthorizeTransport } = await load();
        const out = await authorize(REQ, {
            transport: createAuthorizeTransport(),
            timeoutMs: 1000,
        });
        expect(out.allowed).toBe(false);
    });
});
