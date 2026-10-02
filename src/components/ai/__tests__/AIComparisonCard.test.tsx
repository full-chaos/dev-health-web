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
        // The AI-side value is the big number and also the AI end of the mark (A4).
        expect(screen.getAllByText("12.0%").length).toBeGreaterThanOrEqual(1);
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
        expect(screen.getAllByText("2.50").length).toBeGreaterThanOrEqual(1);
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
        expect(screen.getByText("+4.0 pts").className).toMatch(/caution/);
        rerender(
            <AIComparisonCard
                label="L"
                aiSide={ai}
                baselineSide={base}
                delta={-3}
                metric="reworkRate"
            />,
        );
        expect(screen.getByText("-3.0 pts").className).toMatch(/positive/);
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

describe("AIComparisonCard missing delta (CHAOS-7763, decision A3)", () => {
    it.each([null, undefined, Number.NaN])(
        "a missing delta (%s) is a dashed 'No baseline' pill, never a good-news pill",
        (delta) => {
            render(
                <AIComparisonCard
                    label="L"
                    aiSide={ai}
                    baselineSide={base}
                    delta={delta}
                    metric="reworkRate"
                />,
            );
            const pill = screen.getByText("No baseline");
            expect(pill.className).toContain("border-dashed");
            expect(pill.className).not.toMatch(/emerald|positive|amber|caution/);
            expect(screen.queryByText("—", { selector: "span" })).toBeNull();
        },
    );

    it("a real zero delta is still the good tone, with its sign text", () => {
        render(
            <AIComparisonCard
                label="L"
                aiSide={ai}
                baselineSide={base}
                delta={0}
                metric="reworkRate"
            />,
        );
        const pill = screen.getByText("0.0 pts");
        expect(pill.className).toMatch(/positive/);
    });
});

describe("AIComparisonCard missing values are not plotted as zero (CHAOS-7763)", () => {
    it("a missing baseline VALUE draws no baseline point: the mark gets a gap, not a 0", () => {
        render(
            <AIComparisonCard
                label="L"
                aiSide={ai}
                baselineSide={null}
                delta={null}
                metric="reworkRate"
            />,
        );
        const spark = screen.getByTestId("sparkline");
        expect(spark.getAttribute("data-data")).toBe("[null,0.12]");
        expect(screen.getByText("No baseline")).toBeInTheDocument();
        expect(screen.getAllByText("12.0%").length).toBeGreaterThanOrEqual(1);
    });

    it("a missing AI-side value draws no AI point either", () => {
        render(
            <AIComparisonCard
                label="L"
                aiSide={null}
                baselineSide={base}
                delta={null}
                metric="reworkRate"
            />,
        );
        expect(screen.getByTestId("sparkline").getAttribute("data-data")).toBe("[0.08,null]");
    });
});
