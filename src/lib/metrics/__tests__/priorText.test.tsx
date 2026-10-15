import { describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen } from "@/test/utils";
import type { MetricFilter } from "@/lib/filters/types";
import { HOME_QUERY } from "@/lib/graphql/queries";
import { toHomeResponse } from "@/lib/graphql/homeFetchers";
import type { HomeGraphQLResult } from "@/lib/graphql/types";
import type { CockpitSignal, MetricDelta } from "@/lib/types";
import { RankedSignals } from "@/components/home/RankedSignals";

import { signalPriorText } from "../priorText";

vi.mock("next/navigation", () => ({
    usePathname: () => "/dashboard",
    useSearchParams: () => new URLSearchParams(),
}));

const filters = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 90, compare_days: 90 },
    who: {},
    what: {},
    why: {},
    how: {},
} as MetricFilter;

const signal = (prior: string | null): CockpitSignal => ({
    id: "metric:churn",
    title: "Churn appears down",
    metric: "churn",
    severity: "low",
    confidence: "medium",
    affected_scope: "org",
    evidence_count: 1,
    current_value: "0",
    prior_value: prior,
    delta: "-100%",
    direction: "down",
    category: "delivery",
    why_it_matters: "",
    recommended_action: "",
    evidence_ref: "/api/home/explain/churn",
});

const delta = (over: Partial<MetricDelta>): MetricDelta => ({
    metric: "churn",
    label: "Churn",
    value: 0,
    unit: "lines",
    delta_pct: -100,
    has_data: true,
    has_prior_data: true,
    spark: [],
    ...over,
});

describe("signalPriorText (CHAOS-9047)", () => {
    it("keeps the served signal string first", () => {
        expect(signalPriorText(signal("12 lines"), delta({ prior_value: 99 }))).toBe("12 lines");
    });
    it("draws the measured prior when the signal has none", () => {
        expect(signalPriorText(signal(null), delta({ prior_value: 120 }))).toBe("120 lines");
    });
    it("draws a measured 0 as a value", () => {
        expect(signalPriorText(signal(null), delta({ prior_value: 0 }))).toBe("0 lines");
    });
    it("draws nothing for a null, absent or no-prior-data prior", () => {
        expect(signalPriorText(signal(null), delta({ prior_value: null }))).toBeNull();
        expect(signalPriorText(signal(null), delta({}))).toBeNull();
        expect(
            signalPriorText(signal(null), delta({ prior_value: 5, has_prior_data: false })),
        ).toBeNull();
        expect(signalPriorText(signal(null), undefined)).toBeNull();
    });
});

describe("Home prior value wiring (CHAOS-9047)", () => {
    it("selects priorValue right after hasPriorData", () => {
        expect(HOME_QUERY).toMatch(/hasPriorData\s+priorValue\s+spark/);
    });

    it("maps the priorValue of a delta, keeps null and a stored 0, omits it when absent", () => {
        const base = {
            metric: "churn",
            label: "Churn",
            value: 0,
            unit: "lines",
            deltaPct: -100,
            hasData: true,
            hasPriorData: true,
            spark: [],
        };
        const run = (d: Record<string, unknown>) =>
            toHomeResponse({
                freshness: { sources: [], coverage: null },
                tiles: [],
                deltas: [d],
                signals: [],
                reworkThemeAllocation: [],
                summary: [],
                constraint: null,
                limitingFactor: {},
                dataConfidence: {},
                scopeDataConfidence: {},
                events: [],
                healthState: { status: "ok", headline: "", summary: "" },
            } as unknown as HomeGraphQLResult).deltas[0];
        expect(run({ ...base, priorValue: 0 }).prior_value).toBe(0);
        expect(run({ ...base, priorValue: null }).prior_value).toBeNull();
        expect("prior_value" in run(base)).toBe(false);
    });

    it("shows a measured prior in the Previous column when the signal string is empty", () => {
        render(
            <RankedSignals
                signals={[signal("x"), signal(null)]}
                deltas={[delta({ prior_value: 0 })]}
                filters={filters}
            />,
        );
        expect(screen.getByTestId("signal-previous")).toHaveTextContent("0 lines");
    });
});
