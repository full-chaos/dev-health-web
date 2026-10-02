import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, userEvent, waitFor, within } from "@/test/utils";
import { getHeatmap } from "@/lib/api/visuals";
import type { HeatmapCell, HeatmapResponse } from "@/lib/types";

import { HeatmapPanel } from "./HeatmapPanel";

// CHAOS-8060: a heatmap cell opens the ONE shared evidence drawer. The drawer body loads the
// cell's artifacts; the card under the chart keeps the default summary. Invented data.

const chartProps = vi.hoisted(() => ({ last: null as null | Record<string, unknown> }));

// The echarts chart is replaced by one button per cell that selects it, as a cell click does.
vi.mock("./HeatmapChart", () => ({
    HeatmapChart: (props: {
        data: HeatmapResponse;
        onCellSelectAction: (cell: HeatmapCell) => void;
    }) => {
        chartProps.last = props;
        return (
            <div data-testid="heatmap-chart">
                {props.data.cells.map((cell) => (
                    <button
                        key={`${cell.y}-${cell.x}`}
                        type="button"
                        onClick={() => props.onCellSelectAction(cell)}
                    >
                        cell {cell.y} {cell.x}
                    </button>
                ))}
            </div>
        );
    },
}));
vi.mock("@/lib/api/visuals", () => ({ getHeatmap: vi.fn() }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/code",
    useSearchParams: () => new URLSearchParams(),
}));

const request = {
    type: "risk" as const,
    metric: "hotspot_risk",
    scope_type: "org",
    range_days: 90,
};

const grid: HeatmapResponse = {
    axes: { x: ["Mon", "Tue"], y: ["auth", "billing"] },
    cells: [
        { x: "Mon", y: "auth", value: 0.04 },
        { x: "Tue", y: "billing", value: 9 },
    ],
    legend: { unit: "risk", scale: "linear" },
    evidence: [{ path: "src/services/auth/login.ts", value: 12 }],
};

const cellResponse = (evidence: HeatmapResponse["evidence"]): HeatmapResponse => ({
    ...grid,
    evidence,
});

const panel = () => (
    <HeatmapPanel
        title="Hotspot concentration"
        description="Where churn accumulates."
        request={request}
        initialData={grid}
        evidenceTitle="Hotspot evidence"
        defaultSummary="Leading hotspots: Auth Service."
    />
);

const fact = (drawer: HTMLElement, label: string) =>
    within(drawer)
        .getAllByTestId("evidence-fact")
        .find((row) => row.querySelector("dt")?.textContent === label)
        ?.querySelector("dd");

beforeEach(() => {
    chartProps.last = null;
    vi.mocked(getHeatmap).mockReset();
});

describe("HeatmapPanel evidence drawer", () => {
    it("gives the chart the served grid unchanged (the ramp input stays)", () => {
        render(panel());
        expect(chartProps.last?.data).toBe(grid);
    });

    it("opens the shared drawer from a cell and loads that cell's artifacts with the grid request", async () => {
        vi.mocked(getHeatmap).mockResolvedValue(
            cellResponse([{ path: "src/billing/invoice.ts", value: 4 }]),
        );
        render(panel());
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(getHeatmap).not.toHaveBeenCalled();

        await userEvent.click(screen.getByRole("button", { name: "cell billing Tue" }));

        const drawer = screen.getByRole("dialog", { name: "Evidence & Context" });
        expect(within(drawer).getByTestId("evidence-subject")).toHaveTextContent("billing · Tue");
        expect(getHeatmap).toHaveBeenCalledWith({ ...request, x: "Tue", y: "billing", limit: 50 });
        // The cell value is the served one, with the legend unit.
        expect(fact(drawer, "Value")).toHaveTextContent(/^9 risk$/);
        expect(await within(drawer).findByText("invoice.ts")).toBeInTheDocument();
        expect(fact(drawer, "Artifacts")).toHaveTextContent(/^1 artifact$/);
    });

    it("keeps the default summary and the first artifact list under the chart after a cell is opened", async () => {
        vi.mocked(getHeatmap).mockResolvedValue(
            cellResponse([{ path: "src/billing/invoice.ts", value: 4 }]),
        );
        render(panel());
        await userEvent.click(screen.getByRole("button", { name: "cell billing Tue" }));
        const drawer = screen.getByRole("dialog");
        await within(drawer).findByText("invoice.ts");

        const onPage = (text: string) =>
            screen.queryAllByText(text).filter((node) => !drawer.contains(node));
        expect(onPage("Leading hotspots: Auth Service.")).toHaveLength(1);
        expect(onPage("login.ts")).toHaveLength(1);
        // The cell's artifacts are in the drawer only.
        expect(onPage("invoice.ts")).toHaveLength(0);
    });

    it("shows an error, not 'no artifacts', when the cell request fails", async () => {
        vi.mocked(getHeatmap).mockRejectedValue(new Error("boom"));
        render(panel());
        await userEvent.click(screen.getByRole("button", { name: "cell billing Tue" }));

        const drawer = screen.getByRole("dialog");
        expect(await within(drawer).findByText("Unable to load this view")).toBeInTheDocument();
        expect(within(drawer).queryByText(/No artifacts linked to this cell/)).toBeNull();
        // Not loaded is not "none".
        expect(fact(drawer, "Artifacts")).toHaveTextContent(/^Not reported$/);
    });

    it("says so when the cell has no artifacts (an empty list is not a zero)", async () => {
        vi.mocked(getHeatmap).mockResolvedValue(cellResponse([]));
        render(panel());
        await userEvent.click(screen.getByRole("button", { name: "cell auth Mon" }));

        const drawer = screen.getByRole("dialog");
        await waitFor(() => expect(fact(drawer, "Artifacts")).toHaveTextContent(/^None returned$/));
        // A small served value keeps the chart tooltip's precision; it is not rounded to 0.
        expect(fact(drawer, "Value")).toHaveTextContent(/^0\.04 risk$/);
        expect(
            within(drawer).getByText("No artifacts linked to this cell in the selected window."),
        ).toBeInTheDocument();
    });

    it("starts the cell drawer with the five provenance rows: only the artifact count is served", async () => {
        vi.mocked(getHeatmap).mockResolvedValue(
            cellResponse([{ path: "src/billing/invoice.ts", value: 4 }]),
        );
        render(panel());
        await userEvent.click(screen.getByRole("button", { name: "cell billing Tue" }));
        const drawer = screen.getByRole("dialog");
        await within(drawer).findByText("invoice.ts");

        const rows = within(within(drawer).getByTestId("evidence-facts"))
            .getAllByTestId("evidence-fact")
            .map((row) => [
                row.querySelector("dt")?.textContent,
                row.querySelector("dd")?.textContent,
            ]);
        expect(rows).toEqual([
            ["Source", "Not reported"],
            ["Data quality", "Not reported"],
            ["Last sync", "Not reported"],
            ["Identity confidence", "Not reported"],
            ["Artifacts", "1 artifact"],
        ]);
    });

    it("Escape closes the drawer and focus returns to the chart region (a cell is a mark on the canvas)", async () => {
        vi.mocked(getHeatmap).mockResolvedValue(cellResponse([]));
        render(panel());
        const region = screen.getByTestId("heatmap-chart-region");
        expect(region).toHaveAttribute("tabindex", "-1");
        expect(region).toHaveAccessibleName("Hotspot concentration chart");
        // A real cell is a mark on a canvas; the stand-in must not keep focus itself.
        const cell = screen.getByRole("button", { name: "cell billing Tue" });
        await userEvent.click(cell);
        cell.blur();
        expect(screen.getByRole("dialog")).toBeInTheDocument();

        await userEvent.keyboard("{Escape}");

        expect(screen.queryByRole("dialog")).toBeNull();
        expect(region).toHaveFocus();
    });

    it("loads again for another cell, with that cell's coordinates", async () => {
        vi.mocked(getHeatmap).mockResolvedValue(cellResponse([]));
        render(panel());
        await userEvent.click(screen.getByRole("button", { name: "cell billing Tue" }));
        await userEvent.click(screen.getByRole("button", { name: "cell auth Mon" }));

        expect(screen.getAllByRole("dialog")).toHaveLength(1);
        expect(screen.getByTestId("evidence-subject")).toHaveTextContent("auth · Mon");
        expect(getHeatmap).toHaveBeenLastCalledWith({ ...request, x: "Mon", y: "auth", limit: 50 });
    });
});
