import { describe, expect, it } from "vitest";

import { isRefusalTurn, narrowingAxis, type RefusalEvent } from "../transcript";

const refusal = (details: Record<string, unknown> | undefined): RefusalEvent =>
    ({
        type: "error",
        reserved_result_id: "result_reserved",
        error: { error: { code: "budget_refusal", details } },
    }) as unknown as RefusalEvent;

describe("narrowingAxis", () => {
    it.each([
        "evidence_window",
        "result_count",
        "scope_anchor",
        "group_selection",
        "comparison_pair",
    ])("reads the closed axis %s", (axis) => {
        expect(narrowingAxis(refusal({ narrower_continuation: { axis } }))).toBe(axis);
    });

    it("reads a value outside the closed list as absent, never shown", () => {
        expect(narrowingAxis(refusal({ narrower_continuation: { axis: "brand_new" } }))).toBeNull();
    });

    it("reads no continuation, no details and a non-string axis as absent", () => {
        expect(narrowingAxis(refusal({}))).toBeNull();
        expect(narrowingAxis(refusal(undefined))).toBeNull();
        expect(narrowingAxis(refusal({ narrower_continuation: { axis: 3 } }))).toBeNull();
        expect(narrowingAxis(refusal({ narrower_continuation: "evidence_window" }))).toBeNull();
    });
});

describe("isRefusalTurn", () => {
    it("tells a refusal turn from a result turn", () => {
        const event = refusal({});
        expect(isRefusalTurn({ question: "Why?", refusal: event })).toBe(true);
        expect(isRefusalTurn({ result_id: "result_1" } as never)).toBe(false);
    });
});
