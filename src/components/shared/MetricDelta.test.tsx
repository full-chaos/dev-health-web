import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";

import { MetricDelta } from "./MetricDelta";

describe("MetricDelta", () => {
	it("renders rounded signed zero as 0% with muted tone", () => {
		render(<MetricDelta value={-0.2} />);

		const delta = screen.getByText("· 0%");
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

		expect(screen.getByText("· No prior period")).toHaveClass(
			"text-(--ink-muted)",
		);
	});

	it("treats Infinity as unavailable", () => {
		render(<MetricDelta value={Number.POSITIVE_INFINITY} />);

		expect(screen.getByText("· No prior period")).toHaveClass(
			"text-(--ink-muted)",
		);
	});
});
