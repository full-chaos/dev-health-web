/** Complexity Flame tab: the shared section, the shared segment control and the icicle chart. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@/test/utils";

import type { MetricFilter } from "@/lib/filters/types";
import { FlameView } from "./FlameView";

const replace = vi.hoisted(() => vi.fn());
const getAggregatedFlame = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams("tab=flame"),
    usePathname: () => "/complexity",
}));
vi.mock("@/lib/api/visuals", () => ({ getAggregatedFlame }));
vi.mock("@/components/charts/chartTheme", () => ({
    useChartTheme: () => ({ background: "#161c20" }),
    useChartColors: () => ["#0b8fb0", "#c98500", "#da2100", "#02a2bc", "#e8650a"],
    useChartTokens: () => ({
        themeOperational: "#0b8fb0",
        accentHighlight: "#ffab66",
        flameBranch: ["#0b8fb0", "#c98500", "#da2100", "#02a2bc", "#e8650a"],
    }),
}));

const filters = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 90 },
} as unknown as MetricFilter;

const served = (value: number) => ({
    mode: "cycle_breakdown",
    unit: "hours",
    root: {
        name: "Cycle Time",
        value,
        children: [
            { name: "Other", value: value * 0.5 },
            { name: "Active Work", value: value * 0.3 },
            { name: "Waiting", value: value * 0.2 },
        ],
    },
    meta: { window_start: "", window_end: "", filters: {}, notes: [] },
});

beforeEach(() => {
    replace.mockReset();
    getAggregatedFlame.mockReset();
});
afterEach(cleanup);

describe("FlameView", () => {
    it("draws the flame in the shared section with the shared segment control (sentence labels, no caps pills)", async () => {
        getAggregatedFlame.mockResolvedValue(served(240));
        render(<FlameView filters={filters} />);

        expect(
            screen.getByRole("heading", { level: 2, name: "Elapsed Time Breakdown" }),
        ).toBeTruthy();
        const modes = screen.getByRole("group", { name: "Breakdown" });
        expect(
            within(modes)
                .getAllByRole("button")
                .map((button) => button.textContent),
        ).toEqual(["Elapsed Time Breakdown", "Throughput Breakdown", "Code Hotspots"]);
        expect(
            within(modes).getByRole("button", { name: "Elapsed Time Breakdown" }),
        ).toHaveAttribute("aria-pressed", "true");
        expect(within(modes).getByRole("button", { name: "Throughput Breakdown" })).toHaveAttribute(
            "aria-pressed",
            "false",
        );
        // The shared segmented control (prototype `.segments`): sentence case, not caps pills.
        expect(modes).toHaveAttribute("data-testid", "flame-mode-switch");
        expect(modes.innerHTML).not.toMatch(/uppercase|tracking-|rounded-full|color-mix/u);

        // The chart sits in the section: the title row, the root row, no fixed 100vh canvas.
        expect(await screen.findByTestId("flame-title-row")).toBeTruthy();
        expect(screen.getByTestId("flame-summary").textContent).toBe("Total 10d · 3 children");
        expect(screen.getByTestId("chart-flame").className).not.toMatch(/100vh/u);
        // The mode switch is drawn in the chart's control row.
        expect(
            within(screen.getByTestId("chart-flame")).getByRole("group", {
                name: "Breakdown",
            }),
        ).toBeTruthy();
    });

    it("switching the mode asks for the new mode and keeps it in the address", async () => {
        getAggregatedFlame.mockResolvedValue(served(240));
        render(<FlameView filters={filters} />);
        await screen.findByTestId("flame-title-row");

        fireEvent.click(screen.getByRole("button", { name: "Throughput Breakdown" }));
        expect(replace).toHaveBeenCalledWith("/complexity?tab=flame&mode=throughput");
        await waitFor(() =>
            expect(getAggregatedFlame).toHaveBeenLastCalledWith(
                expect.objectContaining({ mode: "throughput", range_days: 90 }),
            ),
        );
        expect(
            screen.getByRole("heading", { level: 2, name: "Throughput Breakdown" }),
        ).toBeTruthy();
    });

    it("a new mode starts the chart again (no zoom carried over from the old tree)", async () => {
        getAggregatedFlame.mockImplementation(async ({ mode }: { mode: string }) =>
            mode === "throughput"
                ? {
                      ...served(240),
                      unit: "items",
                      root: {
                          name: "Throughput",
                          value: 12,
                          children: [{ name: "Done", value: 12 }],
                      },
                  }
                : {
                      ...served(240),
                      root: {
                          name: "Cycle Time",
                          value: 240,
                          children: [
                              {
                                  name: "Waiting",
                                  value: 240,
                                  children: [{ name: "backlog", value: 240 }],
                              },
                          ],
                      },
                  },
        );
        render(<FlameView filters={filters} />);
        fireEvent.click(await screen.findByTitle("Waiting"));
        expect(screen.getByTestId("flame-root-row")).toHaveAttribute("title", "Waiting");

        fireEvent.click(screen.getByRole("button", { name: "Throughput Breakdown" }));
        await waitFor(() =>
            expect(screen.getByTestId("flame-root-row")).toHaveAttribute("title", "Throughput"),
        );
        expect(screen.getByTestId("flame-summary").textContent).toBe("Total 12 items · 1 child");
    });

    it("keeps the mode switch when the scope has no flame data", async () => {
        getAggregatedFlame.mockResolvedValue(served(0));
        render(<FlameView filters={filters} />);
        expect(
            await screen.findByText("No flame data available for this scope and window."),
        ).toBeTruthy();
        expect(screen.getByRole("group", { name: "Breakdown" })).toBeTruthy();
        expect(screen.queryByTestId("flame-title-row")).toBeNull();
    });
});
