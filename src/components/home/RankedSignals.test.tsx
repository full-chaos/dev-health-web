import { render, screen, userEvent, waitFor } from "@/test/utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MetricFilter } from "@/lib/filters/types";

import { RankedSignals } from "./RankedSignals";
import type { CockpitSignal } from "@/lib/types";

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

const makeSignal = (overrides: Partial<CockpitSignal> = {}): CockpitSignal => ({
	id: "sig-1",
	title: "Review latency is climbing",
	metric: "review_latency",
	severity: "high",
	confidence: "medium",
	affected_scope: "3 repos · payments",
	evidence_count: 7,
	current_value: "2.4d",
	prior_value: "1.6d",
	delta: "+50%",
	direction: "up",
	category: "delivery",
	why_it_matters: "Longer reviews delay delivery.",
	recommended_action: "Rebalance reviewers.",
	evidence_ref: "/api/home/explain/review_latency",
	...overrides,
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("RankedSignals", () => {
	it("renders a trust-preserving empty state for empty signals", () => {
		render(<RankedSignals signals={[]} filters={filters} />);

		expect(screen.getByTestId("ranked-signals-empty")).toBeInTheDocument();
		// never implies a clean bill of health
		expect(screen.getByText(/surfaced nothing notable/i)).toBeInTheDocument();
		expect(screen.queryByTestId("signal-card")).not.toBeInTheDocument();
	});

	it("renders signals in rank order with the top signal emphasized", () => {
		const signals = [
			makeSignal({
				id: "sig-1",
				title: "Top signal claim",
				severity: "critical",
			}),
			makeSignal({
				id: "sig-2",
				title: "Second signal claim",
				severity: "medium",
			}),
		];

		render(<RankedSignals signals={signals} filters={filters} />);

		const cards = screen.getAllByTestId("signal-card");
		expect(cards).toHaveLength(2);
		expect(cards[0]).toHaveAttribute("data-emphasized", "true");
		expect(cards[0]).toHaveTextContent("Top signal claim");
		expect(cards[1]).toHaveAttribute("data-emphasized", "false");
		expect(cards[1]).toHaveTextContent("Second signal claim");
	});

	it("opens a populated EvidencePanel via evidence_ref", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						metric: "review_latency",
						label: "Review latency",
						value: 2.4,
						unit: "days",
						delta_pct: 50,
						summary: "Review latency appears higher in this window.",
						evidence: [
							{
								id: "PR-1",
								title: "Shorten review queue",
								url: "/prs/PR-1",
								type: "pr",
								meta: "merged in 2d",
							},
						],
						actions: [],
						provenance: {
							source: "workGraphEdges",
							quality: "high",
							last_sync: "2026-05-20T00:00:00Z",
							identity_confidence: 0.92,
						},
					}),
			}),
		);

		render(<RankedSignals signals={[makeSignal()]} filters={filters} />);

		await userEvent.click(screen.getByTestId("signal-open-evidence"));

		await waitFor(() =>
			expect(screen.getByText("Quality + provenance")).toBeInTheDocument(),
		);
		// Panel is populated with a real artifact — not an empty / recommendation-only drawer.
		expect(screen.getByText("Shorten review queue")).toBeInTheDocument();
		expect(screen.getByText(/Source: workGraphEdges/i)).toBeInTheDocument();
		expect(global.fetch).toHaveBeenCalledWith(
			"/api/home/explain/review_latency",
		);
	});
});
