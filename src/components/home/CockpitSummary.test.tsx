import { render, screen } from "@/test/utils";
import { describe, expect, it, vi } from "vitest";

import type { MetricFilter } from "@/lib/filters/types";
import type { CockpitSignal, HomeResponse } from "@/lib/types";

import { CockpitSummary } from "./CockpitSummary";

vi.mock("next/navigation", () => ({
	useSearchParams: () => new URLSearchParams(),
}));

const filters = {
	scope: { level: "org", ids: ["org-1"] },
	time: { range_days: 30 },
	who: {},
	what: {},
	why: {},
	how: {},
} as MetricFilter;

const topSignal: CockpitSignal = {
	id: "sig-1",
	title: "Review latency is climbing",
	metric: "review_latency",
	current_value: "2.4d",
	prior_value: "1.6d",
	delta: "+50%",
	direction: "up",
	severity: "high",
	confidence: "medium",
	affected_scope: "3 repos · payments",
	evidence_count: 7,
	why_it_matters: "Longer reviews delay delivery and frustrate contributors.",
	recommended_action: "Rebalance reviewers on the payments repos.",
	evidence_ref: "/api/home/explain/review_latency",
	category: "delivery",
};

const makeHome = (overrides: Partial<HomeResponse> = {}): HomeResponse => ({
	freshness: {
		last_ingested_at: null,
		sources: {},
		coverage: {
			repos_covered_pct: 0,
			prs_linked_to_issues_pct: 0,
			issues_with_cycle_states_pct: 0,
		},
	},
	deltas: [],
	summary: [],
	tiles: {},
	constraint: { title: "", claim: "", evidence: [], experiments: [] },
	events: [],
	health_state: {
		status: "at_risk",
		headline: "Review latency is the limiting factor this week",
		summary: "Reviews are taking longer and slowing delivery.",
	},
	signals: [topSignal],
	limiting_factor: {
		claim: "Review latency is the limiting factor.",
		why_it_matters: "It is the largest drag on delivery.",
		recommended_action: "Rebalance reviewers.",
		confidence: "medium",
	},
	data_confidence: {
		level: "medium",
		connected_sources: ["GitHub"],
		missing_sources: [],
		caveats: [],
	},
	...overrides,
});

describe("CockpitSummary", () => {
	it("renders the dominant health state and headline", () => {
		render(<CockpitSummary home={makeHome()} filters={filters} />);

		expect(screen.getByTestId("cockpit-summary")).toHaveAttribute(
			"data-status",
			"at_risk",
		);
		expect(screen.getByTestId("cockpit-health-status")).toHaveTextContent(
			/at risk/i,
		);
		expect(screen.getByTestId("cockpit-headline")).toHaveTextContent(
			/review latency is the limiting factor/i,
		);
	});

	it("surfaces the top change with why + recommended action + evidence", () => {
		render(<CockpitSummary home={makeHome()} filters={filters} />);

		const topChange = screen.getByTestId("cockpit-top-change");
		expect(topChange).toHaveTextContent("Review latency is climbing");
		expect(topChange).toHaveTextContent(/longer reviews delay/i);
		expect(topChange).toHaveTextContent(/rebalance reviewers/i);
		expect(
			screen.getByTestId("cockpit-top-change-evidence"),
		).toBeInTheDocument();
	});

	it("falls back to a trust-preserving state when there are no signals", () => {
		render(
			<CockpitSummary home={makeHome({ signals: [] })} filters={filters} />,
		);
		expect(screen.getByTestId("cockpit-top-change-empty")).toBeInTheDocument();
		expect(screen.queryByTestId("cockpit-top-change")).not.toBeInTheDocument();
	});

	it("renders a safe default when home is null", () => {
		render(<CockpitSummary home={null} filters={filters} />);
		expect(screen.getByTestId("cockpit-summary")).toHaveAttribute(
			"data-status",
			"watch",
		);
		expect(screen.getByTestId("cockpit-headline")).toBeInTheDocument();
	});
});
