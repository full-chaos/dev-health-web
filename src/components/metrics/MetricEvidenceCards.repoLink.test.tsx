import { describe, expect, it, vi } from "vitest";

import { EvidenceDrawerProvider } from "@/components/evidence/EvidenceDrawerProvider";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import type { MetricDelta } from "@/lib/types";
import { render, screen } from "@/test/utils";

import { MetricEvidenceCards } from "./MetricEvidenceCards";

vi.mock("next/navigation", () => ({
    usePathname: () => "/metrics",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/charts/SparklineChart", () => ({ SparklineChart: () => null }));

const row = (over: Partial<MetricDelta>): MetricDelta => ({
    metric: "cycle_time",
    label: "Cycle Time",
    value: 3,
    unit: "days",
    delta_pct: 0,
    has_data: true,
    has_prior_data: true,
    spark: [],
    ...over,
});

const draw = (r: MetricDelta) => {
    const { container } = render(
        <EvidenceDrawerProvider>
            <MetricEvidenceCards
                metrics={["cycle_time"]}
                deltas={[r]}
                filters={defaultMetricFilter}
                activeRole="engineer"
                placeholderDeltas={false}
            />
        </EvidenceDrawerProvider>,
    );
    return container.textContent ?? "";
};

describe("MetricEvidenceCards repository link notes (CHAOS-9120)", () => {
    it("draws the tier sentence for linked", () => {
        expect(
            draw(
                row({
                    repo_link_state: "linked",
                    repo_link_basis: { native: 56, explicit_text: 7, heuristic: 32 },
                }),
            ),
        ).toContain(
            "From issues linked to this repository's pull requests: 56 native, 7 by text, 32 by heuristic.",
        );
    });
    it("draws no data plus text 3, never 0, for timed_out", () => {
        const text = draw(row({ has_data: false, value: 0, repo_link_state: "timed_out" }));
        expect(text).toContain("This read took too long. No value is shown.");
        expect(text).toContain("No data for this window");
        expect(text).not.toMatch(/\b0\s*days/);
    });
    it("draws no data plus text 2 for no_links", () => {
        expect(draw(row({ has_data: false, value: 0, repo_link_state: "no_links" }))).toContain(
            "No issue is linked to this repository's pull requests in this window.",
        );
    });
    it("draws no link text for an unknown state", () => {
        expect(draw(row({ repo_link_state: "future_state" }))).not.toContain("linked to this");
    });
});
