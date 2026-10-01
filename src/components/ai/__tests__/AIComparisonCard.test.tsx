import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: ({ data, categories }: { data: number[]; categories: string[] }) => (
        <div
            data-testid="sparkline"
            data-data={JSON.stringify(data)}
            data-cats={categories.join("|")}
        />
    ),
}));

import { render, screen } from "@/test/utils";
import { AIComparisonCard } from "../AIComparisonCard";

const ai = { reworkRate: 0.12, reviewsPerPr: 2.5 } as never;
const base = { reworkRate: 0.08, reviewsPerPr: 1.5 } as never;

describe("AIComparisonCard pinned (CHAOS-7763, shared cards)", () => {
    it("shows the label, the AI-side value as a percent, and the signed delta in points", () => {
        render(
            <AIComparisonCard
                label="Rework rate"
                aiSide={ai}
                baselineSide={base}
                delta={4}
                metric="reworkRate"
            />,
        );
        expect(screen.getByText("Rework rate")).toBeInTheDocument();
        expect(screen.getByText("12.0%")).toBeInTheDocument();
        expect(screen.getByText("+4.0 pts")).toBeInTheDocument();
    });

    it("formats a non-percent metric with two decimals and no points suffix", () => {
        render(
            <AIComparisonCard
                label="Reviews per PR"
                aiSide={ai}
                baselineSide={base}
                delta={1}
                metric="reviewsPerPr"
                percent={false}
            />,
        );
        expect(screen.getByText("2.50")).toBeInTheDocument();
        expect(screen.getByText("+1.0")).toBeInTheDocument();
    });

    it("draws the two-point mark with Baseline then AI, and writes both values", () => {
        render(
            <AIComparisonCard
                label="Rework rate"
                aiSide={ai}
                baselineSide={base}
                delta={4}
                metric="reworkRate"
            />,
        );
        const spark = screen.getByTestId("sparkline");
        expect(spark.getAttribute("data-data")).toBe("[0.08,0.12]");
        expect(spark.getAttribute("data-cats")).toBe("Baseline|AI");
        const text = document.body.textContent ?? "";
        expect(text).toContain("8.0%");
        expect(text).toContain("12.0%");
    });

    it("an increase (delta above zero) reads as the caution tone, a decrease as the good tone", () => {
        const { rerender } = render(
            <AIComparisonCard
                label="L"
                aiSide={ai}
                baselineSide={base}
                delta={4}
                metric="reworkRate"
            />,
        );
        expect(screen.getByText("+4.0 pts").className).toMatch(/amber/);
        rerender(
            <AIComparisonCard
                label="L"
                aiSide={ai}
                baselineSide={base}
                delta={-3}
                metric="reworkRate"
            />,
        );
        expect(screen.getByText("-3.0 pts").className).toMatch(/emerald/);
    });

    it("a missing value renders an em dash, never a zero", () => {
        render(
            <AIComparisonCard
                label="L"
                aiSide={null}
                baselineSide={null}
                delta={null}
                metric="reworkRate"
            />,
        );
        expect(screen.getAllByText(/—/).length).toBeGreaterThan(0);
        expect(screen.queryByText("0.0%")).toBeNull();
    });
});
