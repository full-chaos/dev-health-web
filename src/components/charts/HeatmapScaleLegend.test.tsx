import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

import { HeatmapScaleLegend } from "./HeatmapScaleLegend";

vi.mock("./chartTheme", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./chartTheme")>();
    return {
        ...actual,
        useChartTheme: () => actual.fallbackTheme,
        useChartTokens: () => actual.fallbackTokens,
    };
});

describe("HeatmapScaleLegend", () => {
    it("shows the minimum, a middle tick and the maximum with the unit", () => {
        render(<HeatmapScaleLegend min={2} max={10} unit="hours" />);

        expect(screen.getByTestId("heatmap-scale-min")).toHaveTextContent("2");
        expect(screen.getByTestId("heatmap-scale-mid")).toHaveTextContent("6");
        expect(screen.getByTestId("heatmap-scale-max")).toHaveTextContent("10 hours");
        expect(screen.getByRole("img")).toHaveAttribute("aria-label", "Scale from 2 to 10 hours");
    });

    it("keeps a separate swatch for cells with no data", () => {
        render(<HeatmapScaleLegend min={0} max={5} unit="items" />);

        expect(screen.getByTestId("heatmap-scale-empty")).toHaveTextContent("No data");
    });

    it("shows no middle tick when every value is the same", () => {
        render(<HeatmapScaleLegend min={4} max={4} unit="items" />);

        expect(screen.queryByTestId("heatmap-scale-mid")).not.toBeInTheDocument();
        expect(screen.getByTestId("heatmap-scale-max")).toHaveTextContent("4 items");
    });
});
