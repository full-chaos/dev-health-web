import { describe, it, expect } from "vitest";

import {
	DataConfidenceIndicator,
	type DataConfidence,
} from "./DataConfidenceIndicator";
import { render, screen } from "@/test/utils";

const base: DataConfidence = {
	level: "high",
	coverage_pct: 92,
	connected_sources: ["GitHub", "Jira"],
	missing_sources: [],
	caveats: [],
};

describe("DataConfidenceIndicator", () => {
	it("renders the high-confidence level and coverage", () => {
		render(<DataConfidenceIndicator confidence={base} />);
		const root = screen.getByTestId("data-confidence-indicator");
		expect(root).toHaveAttribute("data-level", "high");
		expect(screen.getByText("High confidence")).toBeInTheDocument();
		expect(screen.getByTestId("data-confidence-coverage")).toHaveTextContent(
			"92% coverage",
		);
	});

	it("renders the medium-confidence level", () => {
		render(
			<DataConfidenceIndicator confidence={{ ...base, level: "medium" }} />,
		);
		expect(screen.getByTestId("data-confidence-indicator")).toHaveAttribute(
			"data-level",
			"medium",
		);
		expect(screen.getByText("Medium confidence")).toBeInTheDocument();
	});

	it("renders the low-confidence level", () => {
		render(<DataConfidenceIndicator confidence={{ ...base, level: "low" }} />);
		expect(screen.getByTestId("data-confidence-indicator")).toHaveAttribute(
			"data-level",
			"low",
		);
		expect(screen.getByText("Low confidence")).toBeInTheDocument();
	});

	it("lists connected and missing sources", () => {
		render(
			<DataConfidenceIndicator
				confidence={{
					...base,
					level: "medium",
					connected_sources: ["GitHub"],
					missing_sources: ["GitLab", "Jira"],
				}}
			/>,
		);
		expect(screen.getByText("Connected")).toBeInTheDocument();
		expect(screen.getByText("GitHub")).toBeInTheDocument();
		expect(screen.getByText("Missing")).toBeInTheDocument();
		expect(screen.getByText("GitLab")).toBeInTheDocument();
		expect(screen.getByText("Jira")).toBeInTheDocument();
	});

	it("renders caveats when present and omits the list when empty", () => {
		const { rerender } = render(
			<DataConfidenceIndicator
				confidence={{
					...base,
					caveats: ["Weekend data is sparse for this window."],
				}}
			/>,
		);
		expect(screen.getByTestId("data-confidence-caveats")).toHaveTextContent(
			"Weekend data is sparse for this window.",
		);

		rerender(<DataConfidenceIndicator confidence={{ ...base, caveats: [] }} />);
		expect(
			screen.queryByTestId("data-confidence-caveats"),
		).not.toBeInTheDocument();
	});

	it("omits coverage when coverage_pct is missing", () => {
		render(
			<DataConfidenceIndicator confidence={{ ...base, coverage_pct: null }} />,
		);
		expect(
			screen.queryByTestId("data-confidence-coverage"),
		).not.toBeInTheDocument();
	});

	it("clamps out-of-range coverage to 0–100", () => {
		render(
			<DataConfidenceIndicator confidence={{ ...base, coverage_pct: 140 }} />,
		);
		expect(screen.getByTestId("data-confidence-coverage")).toHaveTextContent(
			"100% coverage",
		);
	});
});
