import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { ChartTypeToggle, INVESTMENT_SANKEY_CHORD_OPTIONS, SANKEY_HEATMAP_OPTIONS, TREEMAP_SUNBURST_OPTIONS } from "./ChartTypeToggle";

describe("ChartTypeToggle", () => {
  it("renders the new chord option while preserving existing options", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <>
        <ChartTypeToggle options={INVESTMENT_SANKEY_CHORD_OPTIONS} value="sankey" onChange={onChange} />
        <ChartTypeToggle options={TREEMAP_SUNBURST_OPTIONS} value="treemap" onChange={vi.fn()} />
        <ChartTypeToggle options={SANKEY_HEATMAP_OPTIONS} value="sankey" onChange={vi.fn()} />
      </>
    );

    expect(screen.getByRole("radio", { name: /chord/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /treemap/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /sunburst/i })).toBeInTheDocument();
    expect(screen.getAllByRole("radio", { name: /sankey/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("radio", { name: /heatmap/i })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /chord/i }));
    expect(onChange).toHaveBeenCalledWith("chord");
  });
});
