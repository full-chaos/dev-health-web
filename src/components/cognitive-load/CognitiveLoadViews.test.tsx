import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/utils";
import { CTA_LABELS } from "@/lib/design/cta";
import type { MetricFilter } from "@/lib/filters/types";

import { OverviewView, contextSpreadSummary, loadDriverSummary } from "./CognitiveLoadViews";

const filters = {
    scope: { level: "team" as const, ids: ["team-1"] },
    time: { range_days: 30 },
    what: { repos: [] },
} as unknown as MetricFilter;

describe("OverviewView", () => {
    it("renders a scope-preserving Open evidence linkback", () => {
        render(
            <OverviewView
                signals={null}
                window={{ sinceDate: "2026-05-01", untilDate: "2026-05-31" }}
                filters={filters}
                activeRole="engineer"
            />,
        );

        const link = screen.getByRole("link", { name: CTA_LABELS.openEvidence });
        const href = link.getAttribute("href") ?? "";
        expect(href).toContain("/explore");
        expect(href).toContain("metric=pr_interruption_load");
        // scope-preserving: filter + role carried through to Explore.
        expect(href).toContain("f=");
        expect(href).toContain("role=engineer");
    });
});

describe("contextSpreadSummary", () => {
    it("reports the chronological last day as Latest even for unsorted Dec→Jan input", () => {
        // The chart sorts internally; the annotation must use the same ordering so it
        // never shows a stale "Latest" against a correctly-ordered line (CHAOS-2079).
        const summary = contextSpreadSummary([
            { day: "2027-01-02", value: 9, label: "01-02" },
            { day: "2026-12-30", value: 1, label: "12-30" },
            { day: "2027-01-01", value: 7, label: "01-01" },
            { day: "2026-12-31", value: 3, label: "12-31" },
        ]);
        expect(summary.hasData).toBe(true);
        expect(summary.latest).toBe(9); // 2027-01-02 is chronologically last
        expect(summary.peak).toBe(9);
    });

    it("is empty for an empty trend", () => {
        expect(contextSpreadSummary([])).toEqual({
            hasData: false,
            latest: null,
            peak: null,
        });
    });
});

describe("loadDriverSummary", () => {
    const zeroDrivers = [
        { label: "PR interruption", value: 0 },
        { label: "Context spread", value: 0 },
        { label: "Review request", value: 0 },
    ];

    it("treats a real all-zero window as data (not empty) and suppresses the share", () => {
        // Rows exist (hasData) but every signal is genuinely zero — a healthy "no load"
        // period. It must plot the zero bars, NOT render the missing-data state, and it
        // must never divide a share by a zero total (CHAOS-2079 honest-empty contract).
        const summary = loadDriverSummary(zeroDrivers, true);
        expect(summary.isEmpty).toBe(false);
        expect(summary.top).toBeNull();
        expect(summary.topShare).toBeNull();
        expect(summary.values).toEqual([0, 0, 0]);
    });

    it("is empty only when there are genuinely no rows", () => {
        expect(loadDriverSummary(zeroDrivers, false).isEmpty).toBe(true);
    });

    it("ranks drivers descending and computes the dominant-driver share when there is load", () => {
        const summary = loadDriverSummary(
            [
                { label: "PR interruption", value: 16 },
                { label: "Context spread", value: 60 },
                { label: "Review request", value: 4 },
            ],
            true,
        );
        expect(summary.isEmpty).toBe(false);
        expect(summary.categories[0]).toBe("Context spread");
        expect(summary.values[0]).toBe(60);
        expect(summary.top?.label).toBe("Context spread");
        expect(summary.topShare).toBe(75); // 60 / (16 + 60 + 4) = 75%
    });
});
