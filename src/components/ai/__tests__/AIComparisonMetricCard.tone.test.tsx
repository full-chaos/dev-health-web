/** CHAOS-9077: the AI comparison card has its own deltaTone; the tone must not move. */
import { afterEach, describe, expect, it } from "vitest";

import { cleanup, render, screen } from "@/test/utils";

import { AIComparisonMetricCard } from "../AIComparisonMetricCard";

afterEach(cleanup);

const GOOD = "text-(--positive)";
const BAD = "text-(--negative)";

function toneOf(delta: number, inverseGood: boolean) {
    render(
        <AIComparisonMetricCard
            title="Metric"
            value={1}
            delta={delta}
            description="d"
            inverseGood={inverseGood}
        />,
    );
    const el = screen.getByText(/vs human baseline/);
    const cls = el.className;
    cleanup();
    return cls;
}

describe("AIComparisonMetricCard delta tone", () => {
    // The card's own rule today: the "risky" direction is a rise (a metric where less is good,
    // like a violation or risk score). Pinned as is.
    it("default: rise is negative, fall is positive, zero muted", () => {
        expect(toneOf(1, false)).toContain(BAD);
        expect(toneOf(-1, false)).toContain(GOOD);
        expect(toneOf(0, false)).toContain("text-(--ink-muted)");
    });
    it("inverseGood: rise is positive, fall is negative", () => {
        expect(toneOf(1, true)).toContain(GOOD);
        expect(toneOf(-1, true)).toContain(BAD);
    });
});
