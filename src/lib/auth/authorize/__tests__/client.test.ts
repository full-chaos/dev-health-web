import { describe, expect, it, vi } from "vitest";
import {
    authorize,
    authorizeBatch,
    type AuthorizeDeps,
    type AuthzOutcome,
    type Transport,
} from "../client";
import type { AuthorizeRequest } from "../request";

const NOW = 1_800_000_000;
const FUTURE = "2027-06-01T00:00:00Z";
const PAST = "2020-01-01T00:00:00Z";

const REQ: AuthorizeRequest = {
    principalReference: "prf_EXAMPLE0000000000000001",
    action: "acr.context.read",
    resource: {
        type: "repository",
        key: "full-chaos/dev-health-ops",
        organizationId: "org_EXAMPLE0000000000000001",
    },
    requestId: "req_EXAMPLE0000000000000000001",
};

function decision(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        schema_version: "authorization_decision.v1",
        decision_id: "dec_EXAMPLE0000000000000000001",
        allowed: true,
        reason_code: "allowed_by_repository_grant",
        principal_id: "prn_EXAMPLE0000000000000001",
        organization_id: "org_EXAMPLE0000000000000001",
        policy_revision: 42,
        expires_at: FUTURE,
        ...over,
    };
}
const batchBody = (items: unknown[]) =>
    JSON.stringify({ schema_version: "authorization_batch_response.v1", decisions: items });
const item = (index: number, over: Record<string, unknown> = {}) => ({
    index,
    decision: decision(over),
});

// Test-only double: replies with a fixed answer. The production module has no default transport.
const reply =
    (status: number, body: string): Transport =>
    async () => ({ status, body });
const deps = (transport: Transport, over: Partial<AuthorizeDeps> = {}): AuthorizeDeps => ({
    transport,
    timeoutMs: 1000,
    nowSeconds: () => NOW,
    ...over,
});
const denyAllDouble: Transport = async () => ({ status: 503, body: "" });

function clientDenyReason(o: AuthzOutcome): string {
    if (o.allowed || o.source !== "client") return "not-a-client-deny";
    return o.reason;
}

interface FailureRow {
    name: string;
    reason: string;
    timeoutMs?: number;
    one: () => Transport;
    many: () => Transport;
}

const swap = (body: string, from: string, to: string) => body.replace(from, to);
const dupOne = swap(
    JSON.stringify(decision({ allowed: false, reason_code: "grant_absent" })),
    '"allowed":false',
    '"allowed":false,"allowed":true',
);
const okMany = () => batchBody([item(0), item(1, { allowed: false, reason_code: "grant_absent" })]);
const same = (t: () => Transport) => ({ one: t, many: t });
const bodyRow = (one: string, many: string) => ({
    one: () => reply(200, one),
    many: () => reply(200, many),
});

const single: FailureRow[] = [
    {
        name: "transport throws an Error",
        reason: "transport_error",
        ...same(() => async () => {
            throw new Error("boom");
        }),
    },
    {
        name: "transport throws a non-Error",
        reason: "transport_error",
        ...same(() => async () => {
            throw "boom";
        }),
    },
    {
        name: "transport never answers",
        reason: "timeout",
        timeoutMs: 5,
        ...same(() => () => new Promise(() => undefined)),
    },
    {
        name: "non-200",
        reason: "non_200",
        ...bodyRowStatus(503, JSON.stringify(decision()), okMany()),
    },
    {
        name: "error.v1 body",
        reason: "service_error",
        ...bodyRow(
            JSON.stringify({ schema_version: "error.v1" }),
            JSON.stringify({ schema_version: "error.v1" }),
        ),
    },
    { name: "bad JSON", reason: "bad_json", ...bodyRow("{", "{") },
    {
        name: "duplicate member",
        reason: "duplicate_member",
        ...bodyRow(dupOne, swap(okMany(), '"allowed":false', '"allowed":false,"allowed":true')),
    },
    {
        name: "wrong shape",
        reason: "bad_shape",
        ...bodyRow(
            JSON.stringify(decision({ allowed: "true" })),
            batchBody([item(0), item(1, { allowed: "true" })]),
        ),
    },
    {
        name: "non-integer policy_revision",
        reason: "non_integer_number",
        ...bodyRow(
            swap(JSON.stringify(decision()), '"policy_revision":42', '"policy_revision":42.0'),
            swap(okMany(), '"policy_revision":42', '"policy_revision":42.0'),
        ),
    },
    {
        name: "expired",
        reason: "expired",
        ...bodyRow(
            JSON.stringify(decision({ expires_at: PAST })),
            batchBody([item(0), item(1, { expires_at: PAST })]),
        ),
    },
    {
        name: "unknown reason",
        reason: "unknown_reason",
        ...bodyRow(
            JSON.stringify(decision({ reason_code: "impersonation_denied" })),
            batchBody([item(0), item(1, { reason_code: "impersonation_denied" })]),
        ),
    },
];

function bodyRowStatus(status: number, one: string, many: string) {
    return { one: () => reply(status, one), many: () => reply(status, many) };
}

describe("authorize", () => {
    it("allows on a valid allow", async () => {
        const o = await authorize(REQ, deps(reply(200, JSON.stringify(decision()))));
        expect(o.allowed).toBe(true);
    });
    it("reports a PDP deny as a pdp deny, not a client failure", async () => {
        const body = JSON.stringify(decision({ allowed: false, reason_code: "grant_absent" }));
        const o = await authorize(REQ, deps(reply(200, body)));
        expect(o.allowed).toBe(false);
        expect(!o.allowed && o.source).toBe("pdp");
    });
    it.each(single)("denies: $name", async (row) => {
        const o = await authorize(REQ, deps(row.one(), { timeoutMs: row.timeoutMs ?? 1000 }));
        expect(o.allowed).toBe(false);
        expect(clientDenyReason(o)).toBe(row.reason);
    });
    it("denies a clock that throws", async () => {
        const o = await authorize(
            REQ,
            deps(reply(200, JSON.stringify(decision())), {
                nowSeconds: () => {
                    throw new Error("clock");
                },
            }),
        );
        expect(clientDenyReason(o)).toBe("internal_error");
    });
    it("denies an invalid request without calling the transport", async () => {
        const t = vi.fn(denyAllDouble);
        const o = await authorize({ ...REQ, action: "admin" }, deps(t));
        expect(clientDenyReason(o)).toBe("invalid_request");
        expect(t).not.toHaveBeenCalled();
    });
    it("sends only the request.v1 members, no caller authority", async () => {
        const t = vi.fn(reply(200, JSON.stringify(decision())));
        await authorize(REQ, deps(t));
        const call = t.mock.calls[0][0];
        expect(call.path).toBe("/v1/authorize");
        const sent = JSON.parse(call.body) as Record<string, unknown>;
        expect(Object.keys(sent).sort()).toEqual([
            "action",
            "context",
            "principal_reference",
            "resource",
            "schema_version",
        ]);
        expect(sent.context).toEqual({
            request_id: REQ.requestId,
            client_service: "dev-health-web",
        });
    });
});

const TWO = [REQ, { ...REQ, requestId: "req_EXAMPLE0000000000000000002" }];
const okBatch = okMany;

const batchOnly: FailureRow[] = [
    { name: "fewer decisions", reason: "batch_count_mismatch", body: batchBody([item(0)]) },
    {
        name: "more decisions",
        reason: "batch_count_mismatch",
        body: batchBody([item(0), item(1), item(2)]),
    },
    { name: "swapped index", reason: "batch_index_mismatch", body: batchBody([item(1), item(0)]) },
    { name: "repeated index", reason: "batch_index_mismatch", body: batchBody([item(0), item(0)]) },
    { name: "skipped index", reason: "batch_index_mismatch", body: batchBody([item(0), item(2)]) },
].map((r) => ({ name: r.name, reason: r.reason, ...same(() => reply(200, r.body)) }));

const batchFailures = [...single, ...batchOnly];

describe("authorizeBatch", () => {
    it("binds each decision to its request by position", async () => {
        const out = await authorizeBatch(TWO, deps(reply(200, okBatch())));
        expect(out.map((o) => o.allowed)).toEqual([true, false]);
    });
    it.each(batchFailures)("denies every entry: $name", async (row) => {
        const out = await authorizeBatch(
            TWO,
            deps(row.many(), { timeoutMs: row.timeoutMs ?? 1000 }),
        );
        expect(out).toHaveLength(2);
        expect(out.map((o) => o.allowed)).toEqual([false, false]);
        expect(out.map(clientDenyReason)).toEqual([row.reason, row.reason]);
    });
    it("denies every entry when one request is invalid, without calling the transport", async () => {
        const t = vi.fn(denyAllDouble);
        const out = await authorizeBatch([REQ, { ...REQ, action: "admin" }], deps(t));
        expect(out.map(clientDenyReason)).toEqual(["invalid_request", "invalid_request"]);
        expect(t).not.toHaveBeenCalled();
    });
    it("denies every entry over the 100 bound", async () => {
        const t = vi.fn(denyAllDouble);
        const out = await authorizeBatch(
            Array.from({ length: 101 }, () => REQ),
            deps(t),
        );
        expect(out.every((o) => clientDenyReason(o) === "batch_bound")).toBe(true);
        expect(t).not.toHaveBeenCalled();
    });
    it("denies every entry when the clock throws", async () => {
        const out = await authorizeBatch(
            TWO,
            deps(reply(200, okBatch()), {
                nowSeconds: () => {
                    throw new Error("clock");
                },
            }),
        );
        expect(out.map(clientDenyReason)).toEqual(["internal_error", "internal_error"]);
    });
    it("sends the batch path", async () => {
        const t = vi.fn(reply(200, okBatch()));
        await authorizeBatch(TWO, deps(t));
        expect(t.mock.calls[0][0].path).toBe("/v1/authorize:batch");
    });
    it("returns nothing for no requests", async () => {
        expect(await authorizeBatch([], deps(denyAllDouble))).toEqual([]);
    });
});
