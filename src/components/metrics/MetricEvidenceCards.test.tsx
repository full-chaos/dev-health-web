import { describe, it, expect, vi } from "vitest";

vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));
const panelProps = vi.hoisted(() => ({ last: null as null | Record<string, unknown> }));
vi.mock("@/components/evidence", () => ({
    EvidencePanel: (props: Record<string, unknown>) => {
        panelProps.last = props;
        return null;
    },
}));

import { MetricEvidenceCards } from "./MetricEvidenceCards";
import { render, screen, userEvent, within } from "@/test/utils";
import { buildExploreUrl } from "@/lib/filters/url";

const deltas = [
    {
        metric: "cycle_time",
        label: "Cycle Time",
        value: 1.4,
        unit: "days",
        delta_pct: 12,
        spark: [
            { ts: "2026-06-01", value: 1 },
            { ts: "2026-06-02", value: 2 },
        ],
    },
];
const filters = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 30 },
    who: {},
    what: {},
    why: {},
    how: {},
} as never;
const row = (metric: string, label: string, value: number, unit: string, delta_pct: number) => ({
    metric,
    label,
    value,
    unit,
    delta_pct,
    spark: [
        { ts: "2026-06-01", value: 1 },
        { ts: "2026-06-02", value: 2 },
    ],
});

describe("MetricEvidenceCards tile (CHAOS-7597)", () => {
    it("shows value, then delta, with both Open evidence targets and a sparkline", () => {
        render(
            <MetricEvidenceCards
                metrics={["cycle_time"]}
                deltas={deltas}
                filters={filters}
                placeholderDeltas={false}
            />,
        );
        const value = screen.getByText("1.4d");
        const delta = screen.getByText(/\+12%/);
        expect(
            value.compareDocumentPosition(delta) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(screen.getAllByText("Open evidence")).toHaveLength(2);
        expect(screen.getByTestId("sparkline")).toBeInTheDocument();
    });

    it("shows a missing value as a muted em dash, not as zero or '--'", () => {
        render(
            <MetricEvidenceCards
                metrics={["cycle_time"]}
                deltas={deltas}
                filters={filters}
                placeholderDeltas
            />,
        );
        expect(screen.getAllByText("—")[0]).toHaveClass("text-(--ink-muted)");
        expect(screen.queryByText("--")).toBeNull();
        expect(screen.queryByText("0")).not.toBeInTheDocument();
    });
});

describe("MetricEvidenceCards pinned behaviour (CHAOS-7705, before merging into MetricCard)", () => {
    const four = [
        row("a", "Up", 10, "%", 12),
        row("b", "Down", 5, "days", -7),
        row("c", "Flat", 3, "hours", 0),
        { ...row("d", "NoSpark", 2, "", 4), spark: [{ ts: "2026-06-01", value: 1 }] },
    ];
    const renderFour = (placeholder = false) =>
        render(
            <MetricEvidenceCards
                metrics={["a", "b", "c", "d"]}
                deltas={four}
                filters={filters}
                placeholderDeltas={placeholder}
            />,
        );

    it("lays the tiles out in a 2 / 4 column grid", () => {
        const { container } = renderFour();
        const grid = container.querySelector("section") as HTMLElement;
        expect(grid.className).toContain("grid-cols-2");
        expect(grid.className).toContain("lg:grid-cols-4");
        expect(container.querySelectorAll("article")).toHaveLength(4);
    });

    it("shows the delta with MetricDelta's arrow and tone (a metric with no polarity reads as higher-is-better)", () => {
        renderFour();
        expect(screen.getByText(/\+12%/)).toHaveClass("text-(--positive)");
        expect(screen.getByText(/↑ \+12%/)).toBeInTheDocument();
        expect(screen.getByText(/↓ -7%/)).toHaveClass("text-(--accent-negative)");
        expect(screen.getByText("· 0%")).toHaveClass("text-(--ink-muted)");
    });

    it("colours a delta by the metric's polarity, not by its sign (CHAOS-7730)", () => {
        const rows = [
            row("cycle_time", "Cycle Time", 4, "days", 10),
            row("review_latency", "Review Latency", 6, "hours", -7),
            row("throughput", "Throughput", 50, "items", 10),
            row("deploy_freq", "Deploy Frequency", 9, "deploys", -5),
        ];
        render(
            <MetricEvidenceCards
                metrics={rows.map((r) => r.metric)}
                deltas={rows}
                filters={filters}
                placeholderDeltas={false}
            />,
        );
        const tone = (label: string, text: RegExp) =>
            within(screen.getByText(label).closest("article") as HTMLElement).getByText(text)
                .className;
        // lowerIsBetter: a rise is bad, a fall is good.
        expect(tone("Cycle Time", /\+10%/)).toContain("text-(--accent-negative)");
        expect(tone("Review Latency", /-7%/)).toContain("text-(--positive)");
        // higherIsBetter: a rise is good, a fall is bad.
        expect(tone("Throughput", /\+10%/)).toContain("text-(--positive)");
        expect(tone("Deploy Frequency", /-5%/)).toContain("text-(--accent-negative)");
    });

    it("formats values per unit", () => {
        renderFour();
        expect(screen.getByText("10%")).toBeInTheDocument();
        expect(screen.getByText("5d")).toBeInTheDocument();
        expect(screen.getByText("3h")).toBeInTheDocument();
    });

    it("shows a muted em dash for the value and 'No prior period' for the delta when deltas are placeholders", () => {
        renderFour(true);
        expect(screen.getAllByText("—")).toHaveLength(4);
        expect(screen.getAllByText("No prior period")).toHaveLength(4);
        expect(screen.queryByText("--")).toBeNull();
        expect(screen.queryByText(/0%/)).toBeNull();
        expect(screen.queryByText("10%")).toBeNull();
    });

    it("shows an em dash value and 'No prior period' (not 0) for a metric that has no data row", () => {
        render(
            <MetricEvidenceCards
                metrics={["ghost"]}
                deltas={[]}
                filters={filters}
                placeholderDeltas={false}
            />,
        );
        expect(screen.getByText("ghost")).toBeInTheDocument();
        expect(screen.getAllByText("—")).toHaveLength(1);
        expect(screen.getByText("No prior period")).toBeInTheDocument();
        expect(screen.queryByText("--")).toBeNull();
        expect(screen.queryByText(/0%/)).toBeNull();
    });

    it("shows the 'Trend' text and no chart for a series of one point", () => {
        renderFour();
        expect(screen.getAllByText("Trend")).toHaveLength(1);
        expect(screen.getAllByTestId("sparkline")).toHaveLength(3);
    });

    it("has two Open evidence targets per tile: a button that opens the panel and a link to Explore", async () => {
        renderFour();
        expect(screen.getAllByRole("button", { name: "Open evidence" })).toHaveLength(4);
        const links = screen.getAllByRole("link", { name: "Open evidence" });
        expect(links).toHaveLength(4);
        expect(links[0]).toHaveAttribute("href", buildExploreUrl({ metric: "a", filters }));
        expect(panelProps.last?.isOpen).toBe(false);
        await userEvent.click(screen.getAllByRole("button", { name: "Open evidence" })[1]);
        expect(panelProps.last).toMatchObject({ isOpen: true, title: "Down", metric: "b" });
    });

    it("passes the role into the Explore link", () => {
        render(
            <MetricEvidenceCards
                metrics={["a"]}
                deltas={four}
                filters={filters}
                activeRole="manager"
                placeholderDeltas={false}
            />,
        );
        expect(screen.getByRole("link", { name: "Open evidence" })).toHaveAttribute(
            "href",
            buildExploreUrl({ metric: "a", filters, role: "manager" }),
        );
    });

    it("markup of a four-tile section (snapshot taken before the merge)", () => {
        const { container } = renderFour();
        expect(container.innerHTML).toMatchSnapshot();
    });

    it("sparkline threshold counts real points: two points with one gap shows 'Trend', not a chart (changed by CHAOS-7705)", () => {
        // Before the merge this series (2 points, 1 null) drew a chart with a single dot.
        const gap = {
            ...row("g", "Gappy", 4, "", 1),
            spark: [
                { ts: "2026-06-01", value: 3 },
                { ts: "2026-06-02", value: null },
            ],
        };
        render(
            <MetricEvidenceCards
                metrics={["g"]}
                deltas={[gap as never]}
                filters={filters}
                placeholderDeltas={false}
            />,
        );
        expect(screen.queryByTestId("sparkline")).toBeNull();
        expect(screen.getByText("Trend")).toBeInTheDocument();
    });
});
