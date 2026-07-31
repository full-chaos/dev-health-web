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

        await user.click(screen.getByRole("button", { name: /open evidence/i }));
        expect(onDrilldown).toHaveBeenCalledOnce();
    });

    it("exposes and dismisses tooltip content from the keyboard", async () => {
        const user = userEvent.setup();
        render(
            <AIComparisonMetricCard
                title="Review load"
                value={4}
                description="Review load card"
                tooltip="Calculated from completed reviews"
            />,
        );

        const trigger = screen.getByRole("button", { name: "Metric information" });
        const tooltip = screen.getByRole("tooltip", { hidden: true });

        expect(trigger).toHaveAttribute("aria-describedby", tooltip.id);
        expect(tooltip).toHaveTextContent("Calculated from completed reviews");
        expect(tooltip).toHaveAttribute("aria-hidden", "true");
        expect(tooltip).toHaveStyle({ opacity: "0", visibility: "hidden" });

        await user.tab();
        expect(trigger).toHaveFocus();
        expect(tooltip).toHaveAttribute("aria-hidden", "false");
        expect(tooltip).toHaveStyle({ opacity: "1", visibility: "visible" });
        await user.keyboard("{Escape}");

        expect(tooltip).toHaveAttribute("aria-hidden", "true");
        expect(tooltip).toHaveStyle({ opacity: "0", visibility: "hidden" });
    });

    it("formats missing values explicitly", () => {
        expect(formatValue(undefined, "h", 1)).toBe("—");
    });
});
