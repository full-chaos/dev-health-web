import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import {
    ChartTypeToggle,
    INVESTMENT_SANKEY_CHORD_OPTIONS,
    SANKEY_HEATMAP_OPTIONS,
    TREEMAP_SUNBURST_OPTIONS,
} from "./ChartTypeToggle";

describe("ChartTypeToggle", () => {
    it("renders the new chord option while preserving existing options", async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();

        render(
            <>
                <ChartTypeToggle
                    options={INVESTMENT_SANKEY_CHORD_OPTIONS}
                    value="sankey"
                    onChangeAction={onChange}
                />
                <ChartTypeToggle
                    options={TREEMAP_SUNBURST_OPTIONS}
                    value="treemap"
                    onChangeAction={vi.fn()}
                />
                <ChartTypeToggle
                    options={SANKEY_HEATMAP_OPTIONS}
                    value="sankey"
                    onChangeAction={vi.fn()}
                />
            </>,
        );

        expect(screen.getByRole("radio", { name: /chord/i })).toBeInTheDocument();
        expect(screen.getByRole("radio", { name: /treemap/i })).toBeInTheDocument();
        expect(screen.getByRole("radio", { name: /sunburst/i })).toBeInTheDocument();
        expect(screen.getAllByRole("radio", { name: /sankey/i }).length).toBeGreaterThan(0);
        expect(screen.getByRole("radio", { name: /heatmap/i })).toBeInTheDocument();
        // Orange marks the selection: wash and ink, never a teal fill (CHAOS-8141).
        const selected = screen.getByRole("radio", { name: /treemap/i });
        expect(selected).toHaveClass("bg-(--accent-wash)");
        expect(selected).toHaveClass("text-(--accent-ink)");
        expect(selected.className).not.toContain("--accent-2");

        await user.click(screen.getByRole("radio", { name: /chord/i }));
        expect(onChange).toHaveBeenCalledWith("chord");
    });
});
