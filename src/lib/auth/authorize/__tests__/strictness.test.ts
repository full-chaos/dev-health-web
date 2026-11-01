import { afterEach, describe, expect, it, vi } from "vitest";
import { authorize, authorizeBatch, type Transport } from "../client";
import { parseBatch, parseDecision } from "../decision";
import type { AuthorizeRequest } from "../request";

const NOW = 1_800_000_000;

function decision(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        schema_version: "authorization_decision.v1",
        decision_id: "dec_EXAMPLE0000000000000000001",
        allowed: true,
        reason_code: "allowed_by_repository_grant",
        principal_id: "prn_EXAMPLE0000000000000001",
        organization_id: "org_EXAMPLE0000000000000001",
        policy_revision: 42,
        expires_at: "2100-06-01T00:00:00Z",
        ...over,
    };
}
const batchOf = (items: Record<string, unknown>[]) =>
    JSON.stringify({
        schema_version: "authorization_batch_response.v1",
        decisions: items.map((d, index) => ({ index, decision: d })),
    });

describe("allowed and reason_code must agree", () => {
    it.each(["grant_absent", "repository_not_granted", "platform_role_absent"])(
        "refuses allowed=true with %s",
        (reason_code) => {
            const r = parseDecision(JSON.stringify(decision({ reason_code })), NOW);
            expect(r).toEqual({ ok: false, reason: "reason_mismatch" });
        },
    );
    it("refuses allowed=false with the allow reason", () => {
        const r = parseDecision(JSON.stringify(decision({ allowed: false })), NOW);
        expect(r).toEqual({ ok: false, reason: "reason_mismatch" });
    });
    it("refuses the whole batch when one entry disagrees", () => {
        const bad = decision({ reason_code: "grant_absent" });
        expect(parseBatch(batchOf([decision(), bad]), 2, NOW)).toEqual({
            ok: false,
            reason: "reason_mismatch",
        });
        expect(parseBatch(batchOf([bad, decision()]), 2, NOW)).toEqual({
            ok: false,
            reason: "reason_mismatch",
        });
    });
    it("accepts the two agreeing pairs", () => {
        expect(parseDecision(JSON.stringify(decision()), NOW).ok).toBe(true);
        const deny = decision({ allowed: false, reason_code: "grant_absent" });
        expect(parseDecision(JSON.stringify(deny), NOW).ok).toBe(true);
    });
});

describe("expires_at must be a real calendar instant", () => {
    it.each([
        "2100-02-29T00:00:00Z",
        "2101-02-29T00:00:00Z",
        "2101-02-30T00:00:00Z",
        "2101-02-31T00:00:00Z",
        "2104-02-30T00:00:00Z",
        "2104-02-31T00:00:00Z",
        "2101-04-31T00:00:00Z",
        "2101-06-31T00:00:00Z",
        "2101-09-31T00:00:00Z",
        "2101-11-31T00:00:00Z",
    ])("refuses %s", (expires_at) => {
        const one = parseDecision(JSON.stringify(decision({ expires_at })), NOW);
        expect(one).toEqual({ ok: false, reason: "bad_shape" });
        const many = parseBatch(batchOf([decision({ expires_at })]), 1, NOW);
        expect(many).toEqual({ ok: false, reason: "bad_shape" });
    });
    it.each(["2104-02-29T00:00:00Z", "2101-01-31T23:59:59Z", "2101-04-30T00:00:00+02:00"])(
        "accepts %s",
        (expires_at) => {
            expect(parseDecision(JSON.stringify(decision({ expires_at })), NOW).ok).toBe(true);
        },
    );
});

describe("expiry is compared in milliseconds", () => {
    afterEach(() => {
        vi.useRealTimers();
    });
    const REQ: AuthorizeRequest = {
        principalReference: "prf_EXAMPLE0000000000000001",
        action: "acr.context.read",
        resource: { type: "organization", key: "org-example-1" },
        requestId: "req_EXAMPLE0000000000000000001",
    };
    const reply =
        (body: string): Transport =>
        async () => ({ status: 200, body });
    const expired = decision({ expires_at: "2027-06-01T00:00:00.500Z" });

    it("denies a decision that expired 100 ms ago (single)", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2027-06-01T00:00:00.600Z"));
        const o = await authorize(REQ, {
            transport: reply(JSON.stringify(expired)),
            timeoutMs: 1000,
        });
        expect(o).toEqual({ allowed: false, source: "client", reason: "expired" });
    });
    it("denies every entry of a batch holding one that expired 100 ms ago", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2027-06-01T00:00:00.600Z"));
        const out = await authorizeBatch([REQ, REQ], {
            transport: reply(batchOf([decision(), expired])),
            timeoutMs: 1000,
        });
        expect(out.map((o) => o.allowed)).toEqual([false, false]);
    });
    it("allows the same decision 100 ms before it expires", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2027-06-01T00:00:00.400Z"));
        const o = await authorize(REQ, {
            transport: reply(JSON.stringify(expired)),
            timeoutMs: 1000,
        });
        expect(o.allowed).toBe(true);
    });
});
