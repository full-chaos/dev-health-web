import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";

import { MetricDelta, metricDeltaParts } from "./MetricDelta";

describe("MetricDelta", () => {
    it("renders a served change under 0.5% with its value, in the muted tone (never 0% or -0%)", () => {
        render(<MetricDelta value={-0.2} />);

        const delta = screen.getByText("↓ -0.2%");
        expect(delta).toBeInTheDocument();
        expect(delta).not.toHaveTextContent("-0%");
        expect(delta).toHaveClass("text-(--ink-muted)");
    });

    it("renders a positive percent delta with positive tone", () => {
        render(<MetricDelta value={12} />);

        const delta = screen.getByText("↑ +12%");
        expect(delta).toHaveClass("text-(--positive)");
    });

    it("renders a negative percent delta with negative tone", () => {
        render(<MetricDelta value={-8} />);

        const delta = screen.getByText("↓ -8%");
        expect(delta).toHaveClass("text-(--accent-negative)");
    });

    it("renders unavailable values with muted tone", () => {
        render(<MetricDelta value={null} unavailableLabel="No comparison" />);

        const delta = screen.getByText("· No comparison");
        expect(delta).toHaveClass("text-(--ink-muted)");
    });

    it("swaps positive and negative tones when inverseGood is true", () => {
        render(<MetricDelta value={12} inverseGood />);

        const delta = screen.getByText("↑ +12%");
        expect(delta).toHaveClass("text-(--accent-negative)");
    });

    it("renders a number-format delta without a percent sign", () => {
        render(<MetricDelta value={5} format="number" />);

        const delta = screen.getByText("↑ +5");
        expect(delta).toHaveClass("text-(--positive)");
    });

    it("formats non-zero precision percent deltas", () => {
        render(<MetricDelta value={2.5} precision={1} />);

        expect(screen.getByText("↑ +2.5%")).toBeInTheDocument();
    });

    it("treats NaN as unavailable", () => {
        render(<MetricDelta value={Number.NaN} />);

        expect(screen.getByText("· No prior period")).toHaveClass("text-(--ink-muted)");
    });

    it("treats Infinity as unavailable", () => {
        render(<MetricDelta value={Number.POSITIVE_INFINITY} />);

        expect(screen.getByText("· No prior period")).toHaveClass("text-(--ink-muted)");
    });
});

describe("metricDeltaParts (the delta rule, for surfaces that draw the delta themselves)", () => {
    it("returns null for a missing delta: missing is never a 0", () => {
        expect(metricDeltaParts(undefined)).toBeNull();
        expect(metricDeltaParts(null)).toBeNull();
        expect(metricDeltaParts(Number.NaN)).toBeNull();
        expect(metricDeltaParts(Number.POSITIVE_INFINITY)).toBeNull();
    });

    it("gives the signed text, the glyph and the polarity of a rise and of a fall", () => {
        expect(metricDeltaParts(12)).toEqual({
            label: "+12%",
            glyph: "↑",
            toneClass: "text-(--positive)",
            polarity: "good",
        });
        expect(metricDeltaParts(-8)).toEqual({
            label: "-8%",
            glyph: "↓",
            toneClass: "text-(--accent-negative)",
            polarity: "bad",
        });
    });

    it("inverts the polarity, never the number, for a lower-is-better metric", () => {
        expect(metricDeltaParts(5, { inverseGood: true })).toMatchObject({
            label: "+5%",
            polarity: "bad",
            toneClass: "text-(--accent-negative)",
        });
        expect(metricDeltaParts(-5, { inverseGood: true })).toMatchObject({
            label: "-5%",
            polarity: "good",
            toneClass: "text-(--positive)",
        });
    });

    it("a change under the shown precision keeps its value and sign, and is muted (no good or bad tone)", () => {
        expect(metricDeltaParts(-0.2)).toEqual({
            label: "-0.2%",
            glyph: "↓",
            toneClass: "text-(--ink-muted)",
            polarity: "flat",
        });
        expect(metricDeltaParts(0.04)).toMatchObject({ label: "+<0.1%", glyph: "↑" });
        expect(metricDeltaParts(0)).toEqual({
            label: "0%",
            glyph: "·",
            toneClass: "text-(--ink-muted)",
            polarity: "flat",
        });
    });

    it("honors the number format and the precision", () => {
        expect(metricDeltaParts(3.26, { format: "number", precision: 1 })?.label).toBe("+3.3");
        expect(metricDeltaParts(3.26, { precision: 1 })?.label).toBe("+3.3%");
    });

    it("MetricDelta says 'No change' in its title only for a served 0", () => {
        const { unmount } = render(<MetricDelta value={0} />);
        expect(screen.getByText("· 0%")).toHaveAttribute("title", "No change");
        unmount();
        const small = render(<MetricDelta value={0.2} />);
        expect(screen.getByText("↑ +0.2%")).not.toHaveAttribute("title");
        small.unmount();
        render(<MetricDelta value={12} />);
        expect(screen.getByText("↑ +12%")).not.toHaveAttribute("title");
    });

    it("is what MetricDelta prints", () => {
        const parts = metricDeltaParts(-8, { inverseGood: true });
        render(<MetricDelta value={-8} inverseGood />);
        const delta = screen.getByText(`${parts?.glyph} ${parts?.label}`);
        expect(delta).toHaveClass(parts?.toneClass ?? "");
    });
});
