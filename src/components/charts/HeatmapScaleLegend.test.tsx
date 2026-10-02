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

    it("shows ONE swatch with the value, not a range, when every value is the same", () => {
        render(<HeatmapScaleLegend min={7.41} max={7.41} unit="%" />);

        expect(screen.getByTestId("heatmap-scale-value")).toHaveTextContent("7.41 %");
        expect(screen.queryByTestId("heatmap-scale-min")).not.toBeInTheDocument();
        expect(screen.queryByTestId("heatmap-scale-mid")).not.toBeInTheDocument();
        expect(screen.queryByTestId("heatmap-scale-max")).not.toBeInTheDocument();
        expect(screen.getByRole("img")).toHaveAttribute("aria-label", "Value 7.41 %");
        // The "No data" swatch stays separate.
        expect(screen.getByTestId("heatmap-scale-empty")).toBeInTheDocument();
    });
});
