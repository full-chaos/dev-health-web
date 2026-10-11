/** CHAOS-9090: the AI comparison card tone comes from an explicit polarity per metric. */
import { afterEach, describe, expect, it } from "vitest";

import { cleanup, render, screen } from "@/test/utils";

import { AI_COMPARISON_POLARITY, AIComparisonMetricCard } from "../AIComparisonMetricCard";

afterEach(cleanup);

const GOOD = "text-(--positive)";
const BAD = "text-(--negative)";
const MUTED = "text-(--ink-muted)";

function toneOf(title: keyof typeof AI_COMPARISON_POLARITY, delta: number) {
    render(
        <AIComparisonMetricCard
            title={title}
            value={1}
            delta={delta}
            description="d"
            polarity={AI_COMPARISON_POLARITY[title]}
        />,
    );
    const cls = screen.getByText(/vs human baseline/).className;
    cleanup();
    return cls;
}

const LOWER = [
    "Rework rate",
    "Revert rate",
    "Test gap rate",
    "Incident rate",
    "Pickup latency",
    "Approval friction",
    "Push iterations after first review",
] as const;
const NO_DIRECTION = [
    "Change request rate",
    "Review comments per LOC",
    "Review amplification",
] as const;

describe("AIComparisonMetricCard delta tone", () => {
    it.each(LOWER)("%s: rise is negative, fall is positive, zero muted", (title) => {
        expect(toneOf(title, 1)).toContain(BAD);
        expect(toneOf(title, -1)).toContain(GOOD);
        expect(toneOf(title, 0)).toContain(MUTED);
    });
    it.each(NO_DIRECTION)("%s: no direction defined, every change is neutral", (title) => {
        expect(toneOf(title, 1)).toContain(MUTED);
        expect(toneOf(title, -1)).toContain(MUTED);
        expect(toneOf(title, 1)).not.toContain(BAD);
        expect(toneOf(title, -1)).not.toContain(GOOD);
    });
    it("the table lists exactly the 10 drawn metrics (test gap rate draws on two panels)", () => {
        expect(Object.keys(AI_COMPARISON_POLARITY).sort()).toEqual(
            [...LOWER, ...NO_DIRECTION].sort(),
        );
    });
    it("polarity higherIsBetter flips the tone", () => {
        render(
            <AIComparisonMetricCard
                title="x"
                value={1}
                delta={1}
                description="d"
                polarity="higherIsBetter"
            />,
        );
        expect(screen.getByText(/vs human baseline/).className).toContain(GOOD);
    });
});
