import { describe, expect, it } from "vitest";
import { CODE_STATES, DECISION_REASON_CODES } from "../../reasonStates";
import {
    ACCEPT_AHEAD_REASON_CODES,
    parseBatch,
    parseDecision,
    WIRE_REASON_CODES,
} from "../decision";

const NOW = 1_800_000_000_000;
const CODE = "allowed_by_platform_admin";

const decision = (over: Record<string, unknown> = {}) => ({
    schema_version: "authorization_decision.v1",
    decision_id: "dec_EXAMPLE0000000000000000001",
    allowed: true,
    reason_code: CODE,
    principal_id: "prn_EXAMPLE0000000000000001",
    organization_id: "org_EXAMPLE0000000000000001",
    policy_revision: 42,
    expires_at: "2100-06-01T00:00:00Z",
    ...over,
});

describe("accept-ahead reason set", () => {
    it("is pinned exactly and disjoint from the contract set", () => {
        expect([...ACCEPT_AHEAD_REASON_CODES]).toEqual([CODE]);
        for (const code of ACCEPT_AHEAD_REASON_CODES) {
            expect((WIRE_REASON_CODES as readonly string[]).includes(code)).toBe(false);
            expect((DECISION_REASON_CODES as readonly string[]).includes(code)).toBe(false);
        }
    });
    it("accepts allowed=true with allowed_by_platform_admin as an allow", () => {
        const r = parseDecision(JSON.stringify(decision()), NOW);
        expect(r.ok && r.decision.allowed).toBe(true);
        expect(r.ok && r.decision.reasonCode).toBe(CODE);
    });
    it("refuses allowed=false with allowed_by_platform_admin", () => {
        expect(parseDecision(JSON.stringify(decision({ allowed: false })), NOW)).toEqual({
            ok: false,
            reason: "reason_mismatch",
        });
    });
    it("accepts the code inside a batch and refuses the batch on a deny with it", () => {
        const batch = (d: Record<string, unknown>) =>
            JSON.stringify({
                schema_version: "authorization_batch_response.v1",
                decisions: [{ index: 0, decision: d }],
            });
        expect(parseBatch(batch(decision()), 1, NOW).ok).toBe(true);
        expect(parseBatch(batch(decision({ allowed: false })), 1, NOW)).toEqual({
            ok: false,
            reason: "reason_mismatch",
        });
    });
    it("maps the code to the allowed UI state", () => {
        expect(CODE_STATES[CODE]).toBe("allowed");
    });
});
