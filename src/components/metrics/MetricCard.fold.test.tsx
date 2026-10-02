import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));

import { MetricCard } from "./MetricCard";
import { render, screen } from "@/test/utils";

// The four optional props added for the Cognitive Load tile (CHAOS-7750). Each is off by default;
// the existing MetricCard tests and the Metrics tile snapshot are the proof that nothing else moved.

describe("MetricCard optional props for string tiles (CHAOS-7750)", () => {
    it("valueText replaces the value as given, even when a number and a unit are also given: no cut into number and unit", () => {
        render(<MetricCard label="L" value={5} unit="%" valueText="7.5 weeks" />);
        expect(screen.getByTestId("metric-value")).toHaveTextContent(/^7\.5 weeks$/);
        expect(screen.getByTestId("metric-value").childElementCount).toBe(0);
        expect(screen.queryByTestId("metric-unit")).toBeNull();
        expect(screen.queryByText("5")).toBeNull();
        expect(screen.queryByText("Not reported")).toBeNull();
    });

    it("valueText of an em dash is shown as given, in the normal value ink", () => {
        render(<MetricCard label="L" valueText="—" />);
        expect(screen.getByText("—")).toHaveClass("text-foreground");
        expect(screen.queryByText("Not reported")).toBeNull();
    });

    it("without valueText a missing value is muted 'Not reported'", () => {
        render(<MetricCard label="L" />);
        expect(screen.getByText("Not reported")).toHaveClass("text-(--ink-muted)");
    });

    it("description is a muted line after the meta row; absent unless given", () => {
        const { rerender } = render(<MetricCard label="L" value={1} delta={5} />);
        expect(screen.queryByTestId("metric-description")).toBeNull();
        rerender(<MetricCard label="L" value={1} delta={5} description="What this means." />);
        const description = screen.getByTestId("metric-description");
        expect(description).toHaveTextContent("What this means.");
        expect(description).toHaveClass("text-(--ink-muted)");
        expect(
            screen.getByText(/\+5%/).compareDocumentPosition(description) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it("hideTrend drops the trend slot: no sparkline and no trend text, with or without a series", () => {
        const spark = [
            { ts: "2026-06-01", value: 1 },
            { ts: "2026-06-02", value: 2 },
        ];
        const { container, rerender } = render(<MetricCard label="L" value={1} spark={spark} />);
        expect(screen.getByTestId("sparkline")).toBeInTheDocument();
        rerender(<MetricCard label="L" value={1} spark={spark} hideTrend />);
        expect(screen.queryByTestId("sparkline")).toBeNull();
        rerender(<MetricCard label="L" value={1} hideTrend />);
        expect(screen.queryByText(/trend/i)).toBeNull();
        expect(container.querySelector("[data-testid='metric-spark']")).toBeNull();
    });

    it("without hideTrend the 'No trend yet' text stays (in the meta line)", () => {
        render(<MetricCard label="L" value={1} />);
        expect(screen.getByText("No trend yet")).toBeInTheDocument();
    });

    it("testId goes on the root element only", () => {
        const { container } = render(<MetricCard label="L" value={1} as="article" testId="tile" />);
        expect(screen.getByTestId("tile")).toBe(container.firstElementChild);
        expect(screen.getByTestId("tile").tagName).toBe("ARTICLE");
    });

    it("none of the optional props adds markup when they are omitted", () => {
        const { container } = render(<MetricCard label="L" value={1} delta={5} />);
        expect(container.firstElementChild).not.toHaveAttribute("data-testid");
        expect(screen.queryByTestId("metric-description")).toBeNull();
        // The meta line follows the value directly.
        expect(screen.getByTestId("metric-value").nextElementSibling).toBe(
            screen.getByTestId("metric-meta"),
        );
    });
});
