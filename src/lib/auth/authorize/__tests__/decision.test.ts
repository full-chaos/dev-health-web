import { describe, expect, it } from "vitest";
import { parseBatch, parseDecision } from "../decision";

const NOW = 1_800_000_000;
const FUTURE = "2027-06-01T00:00:00Z";
const PAST = "2020-01-01T00:00:00Z";

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

const one = (over: Record<string, unknown> = {}) =>
    parseDecision(JSON.stringify(decision(over)), NOW);

function batch(items: unknown[]): string {
    return JSON.stringify({ schema_version: "authorization_batch_response.v1", decisions: items });
}
const item = (index: unknown, over: Record<string, unknown> = {}) => ({
    index,
    decision: decision(over),
});

describe("parseDecision", () => {
    it("accepts an allow with a future expiry", () => {
        const r = one();
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.decision.allowed).toBe(true);
    });
    it("accepts a deny", () => {
        const r = one({ allowed: false, reason_code: "repository_not_granted" });
        expect(r.ok && r.decision.allowed).toBe(false);
    });
    it.each([
        "allowed_by_repository_grant",
        "grant_absent",
        "repository_not_granted",
        "platform_role_absent",
    ])("accepts the wire reason %s", (reason_code) => {
        expect(
            one({ reason_code, allowed: reason_code === "allowed_by_repository_grant" }).ok,
        ).toBe(true);
    });
    it.each([
        "invalid_request",
        "impersonation_denied",
        "delegation_invalid",
        "ALLOWED",
        "free text",
    ])("refuses the reason %s", (reason_code) => {
        expect(one({ reason_code }).ok).toBe(false);
    });
    it("refuses a duplicate allowed member", () => {
        const text = JSON.stringify(decision({ allowed: false })).replace(
            '"allowed":false',
            '"allowed":false,"allowed":true',
        );
        expect(parseDecision(text, NOW).ok).toBe(false);
    });
    it.each([["true"], [1], [null]])("refuses allowed = %s", (allowed) => {
        expect(one({ allowed }).ok).toBe(false);
    });
    it("refuses a missing expires_at", () => {
        const d = decision();
        delete d.expires_at;
        expect(parseDecision(JSON.stringify(d), NOW).ok).toBe(false);
    });
    it("refuses an expired allow and an expired deny", () => {
        expect(one({ expires_at: PAST }).ok).toBe(false);
        expect(one({ allowed: false, reason_code: "grant_absent", expires_at: PAST }).ok).toBe(
            false,
        );
    });
    it("refuses a decimal-form policy_revision", () => {
        const text = JSON.stringify(decision()).replace(
            '"policy_revision":42',
            '"policy_revision":42.0',
        );
        expect(parseDecision(text, NOW).ok).toBe(false);
    });
    it("refuses an extra member", () => {
        expect(one({ roles: ["admin"] }).ok).toBe(false);
    });
    it("refuses obligations on a deny", () => {
        expect(
            one({
                allowed: false,
                reason_code: "grant_absent",
                obligations: { tenant_scope: "org_x" },
            }).ok,
        ).toBe(false);
    });
    it("refuses a wrong schema_version, malformed JSON and a non-object", () => {
        expect(one({ schema_version: "error.v1" }).ok).toBe(false);
        expect(parseDecision("{", NOW).ok).toBe(false);
        expect(parseDecision("[]", NOW).ok).toBe(false);
        expect(parseDecision("", NOW).ok).toBe(false);
    });
});

describe("parseBatch", () => {
    it("accepts items bound to their positions", () => {
        const r = parseBatch(
            batch([item(0), item(1, { allowed: false, reason_code: "grant_absent" })]),
            2,
            NOW,
        );
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.decisions.map((d) => d.allowed)).toEqual([true, false]);
    });
    it("refuses the whole batch with fewer decisions", () => {
        expect(parseBatch(batch([item(0)]), 2, NOW).ok).toBe(false);
    });
    it("refuses the whole batch with more decisions", () => {
        expect(parseBatch(batch([item(0), item(1), item(2)]), 2, NOW).ok).toBe(false);
    });
    it("refuses a swapped, duplicated, skipped or decimal index", () => {
        expect(parseBatch(batch([item(1), item(0)]), 2, NOW).ok).toBe(false);
        expect(parseBatch(batch([item(0), item(0)]), 2, NOW).ok).toBe(false);
        expect(parseBatch(batch([item(0), item(2)]), 2, NOW).ok).toBe(false);
        const text = batch([item(0), item(1)]).replace('"index":1', '"index":1.0');
        expect(parseBatch(text, 2, NOW).ok).toBe(false);
    });
    it("refuses the whole batch when one item is expired or invalid", () => {
        expect(parseBatch(batch([item(0), item(1, { expires_at: PAST })]), 2, NOW).ok).toBe(false);
        expect(parseBatch(batch([item(0), item(1, { reason_code: "nope" })]), 2, NOW).ok).toBe(
            false,
        );
    });
    it("refuses an empty batch and a wrong schema_version", () => {
        expect(parseBatch(batch([]), 0, NOW).ok).toBe(false);
        expect(
            parseBatch(batch([item(0)]).replace("batch_response", "batch_request"), 1, NOW).ok,
        ).toBe(false);
    });
});
