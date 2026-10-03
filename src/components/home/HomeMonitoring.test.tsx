import { describe, expect, it, vi } from "vitest";

import { METRIC_TABS } from "@/lib/metrics/metricTabs";
import { formatMetricParts } from "@/lib/formatters";
import type { MetricFilter } from "@/lib/filters/types";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { render, screen, userEvent, within } from "@/test/utils";
import type { HomeResponse, MetricDelta } from "@/lib/types";

import {
    HomeMonitoring,
    MONITORING_GROUP_METRICS,
    MONITORING_TILE_NOTE,
    type MonitoringView,
} from "./HomeMonitoring";

const MONITORING_TILE_METRICS = MONITORING_GROUP_METRICS.flow;

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
    delta("blocked_work", "Blocked Work", 7, "hours", -20),
    delta("change_failure_rate", "Change Failure Rate", 4.2, "%", -3),
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

const draw = (
    home: HomeResponse | null = makeHome(),
    role = "em",
    lensId = "em",
    initialView?: string | null,
) =>
    render(
        <HomeMonitoring
            home={home}
            filters={filters}
            activeRole={role}
            lensId={lensId}
            initialView={initialView}
        />,
    );

const segments = () =>
    within(screen.getByTestId("monitoring-segments"))
        .getAllByRole("button")
        .map((b) => [b.textContent, b.getAttribute("aria-pressed")]);

const tileIds = () =>
    [
        ...screen
            .getByTestId("monitoring-tiles")
            .querySelectorAll("[data-testid^='monitoring-tile-']"),
    ].map((el) => el.getAttribute("data-testid")?.replace("monitoring-tile-", ""));

const tile = (metric: string) => screen.getByTestId(`monitoring-tile-${metric}`);

// The Monitoring block of Home (CHAOS-8064): approved prototype `.segments` + `metrics(...)`.
describe("HomeMonitoring segments", () => {
    it("has the heading, the jump link and three toggle buttons, Flow pressed by default", () => {
        draw();
        expect(screen.getByRole("heading", { name: "Monitoring" })).toBeInTheDocument();
        expect(segments()).toEqual([
            ["Flow", "true"],
            ["Throughput", "false"],
            ["DORA", "false"],
        ]);
        expect(screen.getByRole("group", { name: "Monitoring views" })).toBeInTheDocument();
        // The toggle is not navigation: no link inside it.
        expect(
            within(screen.getByTestId("monitoring-segments")).queryAllByRole("link"),
        ).toHaveLength(0);
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
    });

    it.each([
        ["Throughput", "throughput"],
        ["DORA", "dora"],
        ["Flow", "flow"],
    ] as const)(
        "clicking %s switches the shown group in place and does not navigate",
        async (label, view) => {
            const user = userEvent.setup();
            // Next keeps its own marker in the history state; seed it, as in the browser.
            window.history.replaceState({ __NA: true }, "");
            const replace = vi.spyOn(window.history, "replaceState");
            const push = vi.spyOn(window.history, "pushState");
            draw(makeHome(), "em", "em", view === "flow" ? "dora" : null);
            await user.click(screen.getByRole("button", { name: label }));

            expect(tileIds()).toEqual([...MONITORING_GROUP_METRICS[view as MonitoringView]]);
            expect(screen.getByRole("button", { name: label })).toHaveAttribute(
                "aria-pressed",
                "true",
            );
            expect(push).not.toHaveBeenCalled();
            expect(new URL(window.location.href).searchParams.get("monitoring")).toBe(view);
            // Next's own history state would make Next skip its router sync (the scope bar then loses it).
            expect(replace).toHaveBeenCalledWith(null, "", expect.anything());
            expect(window.history.state).toBeNull();
            replace.mockRestore();
            window.history.replaceState(null, "");
            push.mockRestore();
        },
    );

    it("the jump link follows the chosen group, with the filter and the role", async () => {
        const user = userEvent.setup();
        draw(makeHome(), "em");
        const jump = () => screen.getByRole("link", { name: /Jump to full diagnostic views/ });
        expect(jump()).toHaveAttribute("href", withFilterParam("/metrics?tab=flow", filters, "em"));
        await user.click(screen.getByRole("button", { name: "DORA" }));
        expect(jump()).toHaveAttribute("href", withFilterParam("/metrics?tab=dora", filters, "em"));
    });

    it("the URL parameter picks the group on load; an unknown value falls back to Flow", () => {
        const first = draw(makeHome(), "em", "em", "dora");
        expect(tileIds()).toEqual([...MONITORING_GROUP_METRICS.dora]);
        first.unmount();
        draw(makeHome(), "em", "em", "nonsense");
        expect(tileIds()).toEqual([...MONITORING_GROUP_METRICS.flow]);
    });

    it("moves with the keyboard: Tab to a button, Enter picks it", async () => {
        const user = userEvent.setup();
        draw();
        await user.tab();
        expect(screen.getByRole("button", { name: "Flow" })).toHaveFocus();
        await user.tab();
        expect(screen.getByRole("button", { name: "Throughput" })).toHaveFocus();
        await user.keyboard("{Enter}");
        expect(tileIds()).toEqual([...MONITORING_GROUP_METRICS.throughput]);
        await user.tab();
        await user.keyboard(" ");
        expect(tileIds()).toEqual([...MONITORING_GROUP_METRICS.dora]);
    });

    it("a metric of the chosen group that is not served reads Not reported", async () => {
        const user = userEvent.setup();
        draw(makeHome([delta("deploy_freq", "Deploy Frequency", 14, "deploys", 22)]));
        await user.click(screen.getByRole("button", { name: "DORA" }));
        expect(tile("deploy_freq")).toHaveTextContent("Deploy Frequency");
        expect(tile("change_failure_rate")).toHaveTextContent("Not reported");
    });
});

describe("HomeMonitoring groups", () => {
    it("shows the same rows, in the same order, as the Metrics tab of that name", () => {
        for (const tab of METRIC_TABS) {
            expect(MONITORING_GROUP_METRICS[tab.id as MonitoringView]).toEqual(tab.metrics);
        }
        expect(Object.keys(MONITORING_GROUP_METRICS).sort()).toEqual([
            "dora",
            "flow",
            "throughput",
        ]);
    });
});

describe("HomeMonitoring tiles", () => {
    it("shows the Flow tiles in the approved order, in one strip of four columns", () => {
        draw();
        const strip = screen.getByTestId("monitoring-tiles");
        expect(strip).toHaveAttribute("data-columns", "4");
        const ids = [...strip.querySelectorAll("[data-testid^='monitoring-tile-']")].map((el) =>
            el.getAttribute("data-testid"),
        );
        expect(ids).toEqual(MONITORING_TILE_METRICS.map((metric) => `monitoring-tile-${metric}`));
        // Another group's metric is not a tile of this group.
        expect(strip).not.toHaveTextContent("Deploy Frequency");
        expect(strip).not.toHaveTextContent("Code Churn");
    });

    it("each tile is its served delta: label, value with unit, change and the window note", () => {
        draw();
        for (const metric of MONITORING_TILE_METRICS) {
            const served = DELTAS.find((d) => d.metric === metric) as MetricDelta;
            const el = tile(metric);
            expect(el).toHaveTextContent(served.label);
            // The tile shows the number and its unit apart (the shared tile's face).
            const parts = formatMetricParts(served.value, served.unit);
            expect(within(el).getByTestId("metric-value")).toHaveTextContent(
                `${parts.value} ${parts.unit}`,
            );
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

    it("polarity: a rise in a lower-is-better metric is the bad tone, in throughput the good tone", async () => {
        const user = userEvent.setup();
        draw(
            makeHome([
                delta("cycle_time", "Cycle Time", 48, "hours", 12),
                delta("throughput", "Throughput", 14, "items", 12),
            ]),
        );
        await user.click(screen.getByRole("button", { name: "Throughput" }));
        const tone = (metric: string) => within(tile(metric)).getByTestId("metric-delta");
        expect(tone("throughput")).toHaveClass("text-(--positive)");
        expect(tone("throughput").textContent).toBe("+12%");
        await user.click(screen.getByRole("button", { name: "Flow" }));
        expect(tone("cycle_time")).toHaveClass("text-(--accent-negative)");
        // The sign is text, so the tone is never the only signal.
        expect(tone("cycle_time").textContent).toBe("+12%");
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
        // The toggle stays in every state.
        expect(segments()).toHaveLength(3);
    });
});
