import { describe, expect, it, vi } from "vitest";

import { formatMetricValue } from "@/lib/formatters";
import type { MetricFilter } from "@/lib/filters/types";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { render, screen, within } from "@/test/utils";
import type { HomeResponse, MetricDelta } from "@/lib/types";

import { HomeMonitoring, MONITORING_TILE_METRICS, MONITORING_TILE_NOTE } from "./HomeMonitoring";

// The chart canvas is not the subject here; the tile's own tests cover the sparkline.
vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));

const filters: MetricFilter = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 90, compare_days: 90 },
    who: {},
    what: {},
    why: {},
    how: {},
};

const delta = (
    metric: string,
    label: string,
    value: number,
    unit: string,
    delta_pct: number,
): MetricDelta => ({
    metric,
    label,
    value,
    unit,
    delta_pct,
    spark: [
        { ts: "2026-09-01", value: 1 },
        { ts: "2026-09-02", value: 2 },
    ],
});

// More deltas than tiles, in another order: the block picks its four by metric key.
const DELTAS: MetricDelta[] = [
    delta("deploy_freq", "Deploy Frequency", 14, "deploys", 22),
    delta("wip_saturation", "WIP Saturation", 301, "%", -29),
    delta("throughput", "Throughput", 1006, "items", -30),
    delta("churn", "Code Churn", 18, "loc", 3),
    delta("review_latency", "Review Latency", 0.3, "hours", 258),
    delta("cycle_time", "Cycle Time", 1.5, "days", 655),
];

const makeHome = (deltas: MetricDelta[] = DELTAS, sources: Record<string, string> = {}) =>
    ({
        freshness: { last_ingested_at: null, sources, coverage: {} },
        deltas,
        summary: [],
        tiles: {},
        constraint: { title: "", claim: "", evidence: [], experiments: [] },
        events: [],
    }) as unknown as HomeResponse;

const draw = (home: HomeResponse | null = makeHome(), role = "em", lensId = "em") =>
    render(<HomeMonitoring home={home} filters={filters} activeRole={role} lensId={lensId} />);

const segments = () =>
    within(screen.getByTestId("monitoring-segments"))
        .getAllByRole("link")
        .map((a) => [a.textContent, a.getAttribute("href")]);

const tile = (metric: string) => screen.getByTestId(`monitoring-tile-${metric}`);

// The Monitoring block of Home (CHAOS-8064): approved prototype `.segments` + `metrics(...)`.
describe("HomeMonitoring segments", () => {
    it("has the heading, the jump text and three segment links with the filter and the role", () => {
        draw();
        expect(screen.getByRole("heading", { name: "Monitoring" })).toBeInTheDocument();
        expect(screen.getByText("Jump to full diagnostic views")).toBeInTheDocument();
        expect(segments()).toEqual([
            ["Flow", withFilterParam("/metrics?tab=flow", filters, "em")],
            ["Throughput", withFilterParam("/metrics?tab=throughput", filters, "em")],
            ["DORA", withFilterParam("/metrics?tab=dora", filters, "em")],
        ]);
        expect(screen.getByRole("navigation", { name: "Monitoring views" })).toBeInTheDocument();
    });

    it.each([
        ["neutral", ["Flow", "Throughput", "DORA"]],
        ["ic", ["Flow", "Throughput", "DORA"]],
        ["leadership", ["Throughput", "DORA", "Flow"]],
        ["not-a-lens", ["Flow", "Throughput", "DORA"]],
    ])("keeps the lens order of the views (%s)", (lensId, order) => {
        draw(makeHome(), "em", lensId);
        expect(segments().map(([label]) => label)).toEqual(order);
    });

    it("has no description cards: the old three link cards are gone", () => {
        draw();
        const block = screen.getByTestId("home-monitoring");
        expect(block).not.toHaveTextContent("Idea to merge insight.");
        expect(block).not.toHaveTextContent("Open metrics");
        expect(block).not.toHaveTextContent("Tabs for steady trend monitoring.");
    });
});

describe("HomeMonitoring tiles", () => {
    it("shows the four approved tiles in the approved order, in one strip of four columns", () => {
        draw();
        const strip = screen.getByTestId("monitoring-tiles");
        expect(strip).toHaveAttribute("data-columns", "4");
        const ids = [...strip.querySelectorAll("[data-testid^='monitoring-tile-']")].map((el) =>
            el.getAttribute("data-testid"),
        );
        expect(ids).toEqual(MONITORING_TILE_METRICS.map((metric) => `monitoring-tile-${metric}`));
        // The other served deltas are not tiles of this block.
        expect(strip).not.toHaveTextContent("Deploy Frequency");
        expect(strip).not.toHaveTextContent("Code Churn");
    });

    it("each tile is its served delta: label, value with unit, change and the window note", () => {
        draw();
        for (const metric of MONITORING_TILE_METRICS) {
            const served = DELTAS.find((d) => d.metric === metric) as MetricDelta;
            const el = tile(metric);
            expect(el).toHaveTextContent(served.label);
            expect(el).toHaveTextContent(formatMetricValue(served.value, served.unit));
            expect(el).toHaveTextContent(`${Math.abs(served.delta_pct)}%`);
            expect(el).toHaveTextContent(MONITORING_TILE_NOTE);
            // The served spark points reach the tile's trend slot.
            expect(within(el).getByTestId("sparkline")).toBeInTheDocument();
        }
    });

    it("each tile links to the evidence page of its metric, with the role and the filter", () => {
        draw(makeHome(), "pm");
        for (const metric of MONITORING_TILE_METRICS) {
            expect(within(tile(metric)).getByRole("link")).toHaveAttribute(
                "href",
                buildExploreUrl({ metric, filters, role: "pm" }),
            );
        }
    });

    it("polarity: a rise in a lower-is-better metric is the bad tone, in throughput the good tone", () => {
        draw(
            makeHome([
                delta("cycle_time", "Cycle Time", 48, "hours", 12),
                delta("throughput", "Throughput", 14, "items", 12),
            ]),
        );
        const tone = (metric: string) =>
            tile(metric).querySelector("span.inline-flex") as HTMLElement;
        expect(tone("cycle_time")).toHaveClass("text-(--accent-negative)");
        expect(tone("throughput")).toHaveClass("text-(--positive)");
        // The sign and the arrow are text, so the tone is never the only signal.
        expect(tone("cycle_time").textContent).toBe("↑ +12%");
    });

    it("a metric the API did not serve reads Not reported: no value, no change, no link", () => {
        draw(makeHome([delta("cycle_time", "Cycle Time", 1.5, "days", 655)]));
        const missing = tile("wip_saturation");
        expect(missing).toHaveTextContent("WIP Saturation");
        expect(missing).toHaveTextContent("Not reported");
        expect(missing.textContent).not.toMatch(/\d/);
        expect(missing).not.toHaveTextContent("No prior period");
        expect(within(missing).queryByRole("link")).toBeNull();
        expect(within(missing).queryByTestId("sparkline")).toBeNull();
        expect(missing).not.toHaveTextContent("No trend yet");
        // The served tile beside it is unchanged.
        expect(within(tile("cycle_time")).getByRole("link")).toBeInTheDocument();
    });

    it("a change that cannot be computed is the labelled 'No prior period' state, never 0%", () => {
        draw(makeHome([delta("cycle_time", "Cycle Time", 48, "hours", Number.NaN)]));
        expect(tile("cycle_time")).toHaveTextContent("No prior period");
        expect(tile("cycle_time")).not.toHaveTextContent("0%");
    });

    it("with no served delta: 'no data connected' without sources, 'no findings' with sources", () => {
        const { unmount } = draw(makeHome([]));
        expect(
            screen.getByTestId("home-monitoring").querySelector("[data-variant]"),
        ).toHaveAttribute("data-variant", "no-data-connected");
        expect(screen.queryByTestId("monitoring-tiles")).toBeNull();
        unmount();

        const withSources = draw(makeHome([], { github: "ok" }));
        expect(
            screen.getByTestId("home-monitoring").querySelector("[data-variant]"),
        ).toHaveAttribute("data-variant", "detector-enabled-no-findings");
        withSources.unmount();

        draw(null);
        expect(
            screen.getByTestId("home-monitoring").querySelector("[data-variant]"),
        ).toHaveAttribute("data-variant", "no-data-connected");
        // The segment links stay in every state.
        expect(segments()).toHaveLength(3);
    });
});
