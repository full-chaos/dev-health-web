import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";
import { AIComparisonMetricCard, formatValue } from "../AIComparisonMetricCard";

describe("AIComparisonMetricCard", () => {
  it("renders populated value and baseline delta", () => {
    render(
      <AIComparisonMetricCard
        title="Rework rate"
        value={0.124}
        unit="%"
        delta={0.031}
        description="AI rework signal"
      />,
    );

    expect(screen.getByText("Rework rate")).toBeInTheDocument();
    expect(screen.getByText("12.40 %")).toBeInTheDocument();
    expect(screen.getByText("+3.10 % vs human baseline")).toBeInTheDocument();
  });

  it("renders fetching state", () => {
    render(
      <AIComparisonMetricCard
        title="Pickup latency"
        value={12}
        unit="h"
        delta={1}
        description="Loading card"
        loading
      />,
    );

    expect(screen.getByText("Loading baseline…")).toBeInTheDocument();
  });

  it("opens drilldown callback", async () => {
    const onDrilldown = vi.fn();
    const user = userEvent.setup();
    render(
      <AIComparisonMetricCard
        title="Incident rate"
        value={0.01}
        unit="%"
        description="Incident card"
        onDrilldown={onDrilldown}
      />,
    );

    await user.click(screen.getByRole("button", { name: /drill into evidence/i }));
    expect(onDrilldown).toHaveBeenCalledOnce();
  });

  it("formats missing values explicitly", () => {
    expect(formatValue(undefined, "h", 1)).toBe("—");
  });
});
