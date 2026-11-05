import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { authorize, authorizeBatch, type Transport, type TransportCall } from "../client";
import { parseBatch, parseDecision } from "../decision";
import type { AuthorizeRequest } from "../request";

const NOW = Date.parse("2027-06-01T00:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

function decision(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        schema_version: "authorization_decision.v1",
        decision_id: "dec_EXAMPLE0000000000000000001",
        allowed: true,
        reason_code: "allowed_by_role",
        principal_id: "prn_EXAMPLE0000000000000001",
        organization_id: "org_EXAMPLE0000000000000001",
        policy_revision: 42,
        expires_at: iso(NOW),
        ...over,
    };
}
const DENY = { allowed: false, reason_code: "repository_not_granted" };
const batchOf = (items: Record<string, unknown>[]) =>
    JSON.stringify({
        schema_version: "authorization_batch_response.v1",
        decisions: items.map((d, index) => ({ index, decision: d })),
    });
const REQ: AuthorizeRequest = {
    principalReference: "prf_EXAMPLE0000000000000001",
    action: "acr.context.read",
    resource: { type: "organization", key: "org-example-1" },
    requestId: "req_EXAMPLE0000000000000000001",
};
const recording = (body: string) => {
    const calls: TransportCall[] = [];
    const transport: Transport = async (call) => {
        calls.push(call);
        return { status: 200, body };
    };
    return { calls, transport };
};
const deps = (transport: Transport) => ({ transport, timeoutMs: 1000, nowMs: () => NOW });

describe("a decision with expires_at = decision time is valid for its own request", () => {
    it("a deny is a PDP answer, single", async () => {
        const t = recording(JSON.stringify(decision(DENY)));
        const o = await authorize(REQ, deps(t.transport));
        expect(o.allowed).toBe(false);
        expect(o).toMatchObject({ source: "pdp", decision: { cacheable: false } });
    });
    it("a deny is a PDP answer, batch entry", async () => {
        const t = recording(batchOf([decision(DENY), decision()]));
        const out = await authorizeBatch([REQ, REQ], deps(t.transport));
        expect(out[0]).toMatchObject({ allowed: false, source: "pdp" });
        expect(out[1]).toMatchObject({ allowed: true, decision: { cacheable: false } });
    });
    it("a no-cache allow is allowed and not cacheable; a second call asks again", async () => {
        const t = recording(JSON.stringify(decision()));
        const a = await authorize(REQ, deps(t.transport));
        const b = await authorize(REQ, deps(t.transport));
        expect(a).toMatchObject({ allowed: true, decision: { cacheable: false } });
        expect(b.allowed).toBe(true);
        expect(t.calls).toHaveLength(2);
    });
    it("an allow with expires_at after now is cacheable", () => {
        const r = parseDecision(JSON.stringify(decision({ expires_at: iso(NOW + 1) })), NOW);
        expect(r.ok && r.decision.cacheable).toBe(true);
    });
    it("expires_at 100 ms in the past is accepted, not cacheable", async () => {
        const body = JSON.stringify(decision({ expires_at: iso(NOW - 100) }));
        const o = await authorize(REQ, deps(recording(body).transport));
        expect(o).toMatchObject({ allowed: true, decision: { cacheable: false } });
        const b = parseBatch(batchOf([decision({ expires_at: iso(NOW - 100) })]), 1, NOW);
        expect(b.ok && b.decisions[0].cacheable).toBe(false);
    });
    it.each(["2027-02-30T00:00:00Z", "not a time", "", "2027-06-01"])(
        "a malformed expires_at %j is still refused",
        (expires_at) => {
            expect(parseDecision(JSON.stringify(decision({ expires_at })), NOW)).toEqual({
                ok: false,
                reason: "bad_shape",
            });
        },
    );
});

describe("web-owned no-cache fixtures", () => {
    const fx = JSON.parse(
        readFileSync(path.join(__dirname, "testdata/no-cache-decisions.json"), "utf8"),
    ) as {
        now: string;
        decisions: { name: string; cacheable: boolean; decision: Record<string, unknown> }[];
    };
    it.each(fx.decisions.map((d) => [d.name, d] as const))("%s", (_name, row) => {
        const r = parseDecision(JSON.stringify(row.decision), Date.parse(fx.now));
        expect(r.ok).toBe(true);
        expect(r.ok && r.decision.cacheable).toBe(row.cacheable);
    });
});
