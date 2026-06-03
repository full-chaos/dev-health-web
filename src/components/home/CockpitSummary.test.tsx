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

	const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
	const HASH32 = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";

	it("never renders a raw UUID as the dominant headline", () => {
		render(
			<CockpitSummary
				home={makeHome({
					health_state: { status: "watch", headline: UUID, summary: "x" },
				})}
				filters={filters}
			/>,
		);
		const headline = screen.getByTestId("cockpit-headline");
		expect(headline.textContent ?? "").not.toContain(UUID);
		expect(headline).toHaveTextContent("#3f2504e0");
		expect(headline).toHaveTextContent(/unresolved/i);
	});

	it("scrubs UUIDs embedded inside the backend-built headline (CHAOS-2064)", () => {
		// Real backend payload interpolates an unresolved scope id into prose.
		const embedded = `Compounding risk appears elevated for ${UUID} across ${UUID}`;
		render(
			<CockpitSummary
				home={makeHome({
					health_state: {
						status: "at_risk",
						headline: embedded,
						summary: `Risk is concentrated in ${UUID}.`,
					},
				})}
				filters={filters}
			/>,
		);
		const summary = screen.getByTestId("cockpit-summary");
		// No raw UUID anywhere in the dominant conclusion block.
		expect(summary.textContent ?? "").not.toContain(UUID);
		const headline = screen.getByTestId("cockpit-headline");
		// Prose is preserved; only the id is degraded to a stable short token.
		expect(headline).toHaveTextContent(/Compounding risk appears elevated/i);
		expect(headline).toHaveTextContent("#3f2504e0");
		expect(headline).toHaveTextContent(/unresolved/i);
	});

	it("never renders a raw hash as the top-change title", () => {
		render(
			<CockpitSummary
				home={makeHome({ signals: [{ ...topSignal, title: HASH32 }] })}
				filters={filters}
			/>,
		);
		const topChange = screen.getByTestId("cockpit-top-change");
		expect(topChange.textContent ?? "").not.toContain(HASH32);
		expect(topChange).toHaveTextContent("#a1b2c3d4");
		expect(topChange).toHaveTextContent(/unresolved/i);
	});

	it("renders the server-resolved scope display name, not its id", () => {
		render(
			<CockpitSummary
				home={makeHome({
					signals: [
						{ ...topSignal, scope: { id: UUID, display_name: "payments-api" } },
					],
				})}
				filters={filters}
			/>,
		);
		const scope = screen.getByTestId("cockpit-top-change-scope");
		expect(scope).toHaveTextContent("payments-api");
		expect(scope.textContent ?? "").not.toContain(UUID);
		expect(scope).not.toHaveTextContent(/unresolved/i);
	});

	it("degrades an unresolved scope id to a short token + Unresolved badge", () => {
		render(
			<CockpitSummary
				home={makeHome({
					signals: [{ ...topSignal, affected_scope: "", scope: { id: UUID } }],
				})}
				filters={filters}
			/>,
		);
		const scope = screen.getByTestId("cockpit-top-change-scope");
		expect(scope.textContent ?? "").not.toContain(UUID);
		expect(scope).toHaveTextContent("#3f2504e0");
		expect(scope).toHaveTextContent(/unresolved/i);
	});

	it("renders a human scope verbatim without an Unresolved badge", () => {
		render(<CockpitSummary home={makeHome()} filters={filters} />);
		const scope = screen.getByTestId("cockpit-top-change-scope");
		expect(scope).toHaveTextContent("3 repos");
		expect(scope).not.toHaveTextContent(/unresolved/i);
	});
});
