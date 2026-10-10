/**
 * CHAOS-9077: Cognitive Load tiles carry the page's own `signal.deltaTone` in a deltaSlot. The
 * class given is the class drawn, whatever it is, and no shared `metric-delta` element appears.
 */
import { afterEach, describe, expect, it } from "vitest";

import { cleanup, render, screen, within } from "@/test/utils";
import type { MetricFilter } from "@/lib/filters/types";

import { OverviewView, type LoadKpi } from "./CognitiveLoadViews";

afterEach(cleanup);

const filters = {
    scope: { level: "team" as const, ids: ["team-1"] },
    time: { range_days: 30 },
    what: { repos: [] },
} as unknown as MetricFilter;

const signal = (label: string, delta: string, deltaTone: string): LoadKpi => ({
    label,
    value: "5",
    delta,
    deltaTone,
    interpretation: "Watch",
    description: `${label} description`,
});

describe("Cognitive Load tile change tone", () => {
    it("draws each signal's own deltaTone, unchanged", () => {
        render(
            <OverviewView
                signals={[
                    signal("Rising load", "up 10% vs prior", "text-(--negative)"),
                    signal("Falling load", "down 10% vs prior", "text-(--positive)"),
                    signal("Flat load", "no change", "text-(--ink-muted)"),
                ]}
                window={{ sinceDate: "2026-05-01", untilDate: "2026-05-31" }}
                filters={filters}
                activeRole="engineer"
                trend={[]}
            />,
        );
        const strip = screen.getByTestId("cognitive-load-tiles");
        expect(within(strip).queryByTestId("metric-delta")).toBeNull();
        const toneOf = (text: string) => within(strip).getByText(text).className;
        expect(toneOf("up 10% vs prior")).toContain("text-(--negative)");
        expect(toneOf("down 10% vs prior")).toContain("text-(--positive)");
        expect(toneOf("no change")).toContain("text-(--ink-muted)");
    });
});
