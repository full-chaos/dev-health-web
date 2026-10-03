import { describe, it, expect, vi } from "vitest";

vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));
const panelProps = vi.hoisted(() => ({ last: null as null | Record<string, unknown> }));
vi.mock("@/components/evidence/EvidencePanel", () => ({
    EvidencePanel: (props: Record<string, unknown>) => {
        panelProps.last = props;
        return null;
    },
}));

import { MetricEvidenceCards } from "./MetricEvidenceCards";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { cleanup, screen, userEvent, within } from "@/test/utils";

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
    it("shows value with its unit, then delta, with ONE Open evidence target (the tile itself) and a sparkline", () => {
        render(
            <MetricEvidenceCards
                metrics={["cycle_time"]}
                deltas={deltas}
                filters={filters}
                placeholderDeltas={false}
            />,
        );
        const value = screen.getByText("1.4");
        expect(screen.getByTestId("metric-unit")).toHaveTextContent(/^days$/);
        const delta = screen.getByText("+12%");
        expect(
            value.compareDocumentPosition(delta) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(screen.getAllByRole("button", { name: "Cycle Time: Open evidence" })).toHaveLength(
            1,
        );
        // The tile face carries no "Open evidence" text; the whole tile is the control.
        expect(screen.queryByText("Open evidence")).toBeNull();
        expect(screen.getByTestId("sparkline")).toBeInTheDocument();
    });

    it("shows a missing value as muted 'Not reported' (MetricCard's contract), not as zero", () => {
        render(
            <MetricEvidenceCards
                metrics={["cycle_time"]}
                deltas={deltas}
                filters={filters}
                placeholderDeltas
            />,
        );
        expect(screen.getAllByText("Not reported")[0]).toHaveClass("text-(--ink-muted)");
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

    it("lays the tiles out in the metric strip: one column per tile, two under the lg breakpoint", () => {
        const { container } = renderFour();
        const strip = screen.getByTestId("metric-tile-strip");
        expect(strip).toHaveAttribute("data-columns", "4");
        expect(strip.className).toContain("grid-cols-2");
        expect(strip.style.getPropertyValue("--cols")).toBe("4");
        expect(strip.querySelectorAll(":scope > article")).toHaveLength(4);
        // The old free-standing 2 / 4 grid of separate cards is gone.
        expect(container.querySelector("section")).toBeNull();
        expect(screen.queryByTestId("metric-strip-filler")).toBeNull();
    });

    it("gives three tiles three columns (the Throughput tab), with no filler cell", () => {
        render(
            <MetricEvidenceCards
                metrics={["a", "b", "c"]}
                deltas={four}
                filters={filters}
                placeholderDeltas={false}
            />,
        );
        const strip = screen.getByTestId("metric-tile-strip");
        expect(strip).toHaveAttribute("data-columns", "3");
        expect(strip.querySelectorAll(":scope > article")).toHaveLength(3);
        expect(screen.queryByTestId("metric-strip-filler")).toBeNull();
    });

    it("shows the delta as a signed number with MetricDelta's tone and no arrow (a metric with no polarity reads as higher-is-better)", () => {
        renderFour();
        expect(screen.getByText("+12%")).toHaveClass("text-(--positive)");
        expect(screen.getByText("-7%")).toHaveClass("text-(--accent-negative)");
        expect(screen.getByText("0%")).toHaveClass("text-(--ink-muted)");
        expect(screen.queryByText(/[↑↓]/)).toBeNull();
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
        const valueOf = (label: string) =>
            within(screen.getByText(label).closest("article") as HTMLElement).getByTestId(
                "metric-value",
            );
        // Number and unit are two elements: the number big, the unit small beside it.
        expect(valueOf("Up").firstElementChild).toHaveTextContent(/^10$/);
        expect(within(valueOf("Up")).getByTestId("metric-unit")).toHaveTextContent(/^%$/);
        expect(valueOf("Down").firstElementChild).toHaveTextContent(/^5$/);
        expect(within(valueOf("Down")).getByTestId("metric-unit")).toHaveTextContent(/^days$/);
        expect(valueOf("Flat").firstElementChild).toHaveTextContent(/^3$/);
        expect(within(valueOf("Flat")).getByTestId("metric-unit")).toHaveTextContent(/^hours$/);
        // A metric with no unit has no unit element.
        expect(valueOf("NoSpark")).toHaveTextContent(/^2$/);
        expect(within(valueOf("NoSpark")).queryByTestId("metric-unit")).toBeNull();
    });

    it("shows a muted 'Not reported' for the value and 'No prior period' for the delta when deltas are placeholders", () => {
        renderFour(true);
        expect(screen.getAllByText("Not reported")).toHaveLength(4);
        expect(screen.getAllByText("No prior period")).toHaveLength(4);
        expect(screen.queryByText(/0%/)).toBeNull();
        expect(screen.queryByText("10")).toBeNull();
        expect(screen.queryAllByTestId("metric-unit")).toHaveLength(0);
    });

    it("shows 'Not reported' as the value and 'No prior period' (not 0) for a metric that has no data row", () => {
        render(
            <MetricEvidenceCards
                metrics={["ghost"]}
                deltas={[]}
                filters={filters}
                placeholderDeltas={false}
            />,
        );
        // No served row: the name comes from the key, readable, and the value is not a number.
        expect(screen.getByText("Ghost")).toBeInTheDocument();
        expect(screen.queryByText("ghost")).toBeNull();
        expect(screen.getAllByText("Not reported")).toHaveLength(1);
        expect(screen.getByText("No prior period")).toBeInTheDocument();
        expect(screen.queryByText(/0%/)).toBeNull();
    });

    it("shows 'No trend yet' and no chart for a series of one point", () => {
        renderFour();
        expect(screen.getAllByText("No trend yet")).toHaveLength(1);
        expect(screen.queryByText("Trend")).toBeNull();
        expect(screen.getAllByTestId("sparkline")).toHaveLength(3);
    });

    it("says what the delta compares: 'vs previous window' after a served delta, nothing after 'No prior period'", () => {
        renderFour();
        const meta = (label: string) =>
            (screen.getByText(label).closest("article") as HTMLElement).textContent ?? "";
        expect(meta("Up")).toContain("+12% · vs previous window");
        expect(screen.getAllByText("vs previous window")).toHaveLength(4);
        cleanup();
        renderFour(true);
        expect(screen.getAllByText("No prior period")).toHaveLength(4);
        expect(screen.queryByText("vs previous window")).toBeNull();
    });

    it("names a catalog metric that has no served row by its catalog label, never by its key", () => {
        render(
            <MetricEvidenceCards
                metrics={["blocked_work"]}
                deltas={[]}
                filters={filters}
                placeholderDeltas={false}
            />,
        );
        expect(screen.getByText("Blocked Work")).toBeInTheDocument();
        expect(screen.queryByText("blocked_work")).toBeNull();
        expect(screen.getByText("Not reported")).toBeInTheDocument();
        expect(screen.getByText("No prior period")).toBeInTheDocument();
    });

    it("has one Open evidence target per tile: a button that opens the shared drawer (no second link to Explore)", async () => {
        renderFour();
        expect(screen.getAllByRole("button", { name: /: Open evidence$/ })).toHaveLength(4);
        expect(screen.getAllByRole("button")).toHaveLength(4);
        expect(screen.queryAllByRole("link", { name: /Open evidence/ })).toHaveLength(0);
        // The shared drawer mounts no panel until a tile opens it.
        expect(panelProps.last).toBeNull();
        await userEvent.click(screen.getByRole("button", { name: "Down: Open evidence" }));
        expect(panelProps.last).toMatchObject({
            isOpen: true,
            title: "Down",
            metric: "b",
            filters,
        });
    });

    it("passes the role to the drawer, which keeps it on its Explore link", async () => {
        render(
            <MetricEvidenceCards
                metrics={["a"]}
                deltas={four}
                filters={filters}
                activeRole="manager"
                placeholderDeltas={false}
            />,
        );
        await userEvent.click(screen.getByRole("button", { name: "Up: Open evidence" }));
        expect(panelProps.last).toMatchObject({ metric: "a", role: "manager" });
    });

    it("markup of a four-tile strip", () => {
        const { container } = renderFour();
        expect(container.innerHTML).toMatchSnapshot();
    });

    it("sparkline threshold counts real points: two points with one gap shows 'No trend yet', not a chart (changed by CHAOS-7705)", () => {
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
        expect(screen.getByText("No trend yet")).toBeInTheDocument();
    });
});
