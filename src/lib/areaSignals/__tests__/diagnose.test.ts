import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock every Diagnose source at the module boundary ─────────────────────────
// The resolver fans out to these; we drive each independently to assert the
// source → AreaSignal mapping (DERIVE vs RETURNED) without any network.

vi.mock("@/lib/api/home", () => ({ getHomeData: vi.fn() }));
vi.mock("@/lib/graphql/server", () => ({ graphqlFetch: vi.fn() }));
vi.mock("@/lib/auth", () => ({
	auth: vi.fn().mockResolvedValue({ user: { org_id: "org-test" } }),
}));
vi.mock("@/lib/logger", () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { getHomeData } from "@/lib/api/home";
import { graphqlFetch } from "@/lib/graphql/server";
import { defaultMetricFilter } from "@/lib/filters/defaults";

import { getDiagnoseSignals } from "../diagnose";
import type { AreaSignal } from "../types";

const mockGetHomeData = vi.mocked(getHomeData);
const mockGraphql = vi.mocked(graphqlFetch);

function byId(signals: AreaSignal[]): Record<string, AreaSignal> {
	return Object.fromEntries(signals.map((s) => [s.id, s]));
}

// Helper: build a complexity timeseries response with a given cyclomaticPerKloc.
function complexityResponse(cyclomaticPerKloc: number) {
	return {
		complexityTimeseries: {
			points: [
				{
					date: "2026-06-01",
					scopeId: "repo-1",
					scopeName: "my-repo",
					cyclomaticPerKloc,
					cyclomaticAvg: cyclomaticPerKloc * 0.5,
					cyclomaticTotal: 100,
					locTotal: 10000,
					highComplexityFunctions: 5,
					veryHighComplexityFunctions: 1,
				},
			],
			totalScope: 1,
		},
	};
}

beforeEach(() => {
	vi.clearAllMocks();

	// Default home response: all three RETURNED metrics present.
	mockGetHomeData.mockResolvedValue({
		deltas: [
			{
				metric: "deploy_freq",
				label: "Deploy Frequency",
				value: 8,
				unit: "deploys",
				delta_pct: 0,
				spark: [],
			},
			{
				metric: "churn",
				label: "Code Churn",
				value: 3200,
				unit: "loc",
				delta_pct: 0,
				spark: [],
			},
			{
				metric: "wip_saturation",
				label: "WIP Saturation",
				value: 72,
				unit: "%",
				delta_pct: 0,
				spark: [],
			},
		],
		signals: [
			{
				id: "df",
				title: "Deploy frequency",
				metric: "deploy_freq",
				current_value: "8",
				direction: "up",
				severity: "low",
				confidence: "medium",
				affected_scope: "org",
				evidence_count: 1,
				why_it_matters: "",
				recommended_action: "",
				category: "delivery",
			},
			{
				id: "churn",
				title: "Code churn",
				metric: "churn",
				current_value: "3200",
				direction: "up",
				severity: "high",
				confidence: "medium",
				affected_scope: "org",
				evidence_count: 2,
				why_it_matters: "",
				recommended_action: "",
				category: "dynamics",
			},
			{
				id: "wip",
				title: "WIP saturation",
				metric: "wip_saturation",
				current_value: "72%",
				direction: "up",
				severity: "critical",
				confidence: "high",
				affected_scope: "org",
				evidence_count: 3,
				why_it_matters: "",
				recommended_action: "",
				category: "delivery",
			},
		],
	} as never);

	// Default complexity: avg cyclomaticPerKloc = 18 → medium (>=15).
	mockGraphql.mockResolvedValue(complexityResponse(18) as never);
});

describe("getDiagnoseSignals — source → AreaSignal mapping", () => {
	it("returns all seven Diagnose sub-areas exactly once, flat (no cluster)", async () => {
		const signals = await getDiagnoseSignals(defaultMetricFilter);
		const ids = signals.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids).toEqual(
			expect.arrayContaining([
				"flow",
				"people",
				"code",
				"landscape",
				"complexity",
				"cognitive-load",
				"bottleneck",
			]),
		);
		// Diagnose is FLAT — no clusters.
		for (const s of signals) expect(s.cluster).toBeUndefined();
	});

	describe("RETURNED signals (home REST severity reused)", () => {
		it("Metrics: reuses deploy_freq signal severity and formats delta value", async () => {
			const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
			expect(signals.flow).toMatchObject({ state: "low", value: "8" });
		});

		it("Code: reuses churn signal severity and formats delta value", async () => {
			const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
			expect(signals.code).toMatchObject({ state: "high", value: "3,200" });
		});

		it("Bottlenecks: reuses wip_saturation signal severity and formats delta value", async () => {
			const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
			expect(signals.bottleneck).toMatchObject({
				state: "critical",
				value: "72%",
			});
		});
	});

	describe("DERIVE signals (Complexity)", () => {
		it("derives Complexity from mean cyclomaticPerKloc (>=15 medium)", async () => {
			// cyclomaticPerKloc = 18 → medium (>=15, <25).
			const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
			expect(signals.complexity).toMatchObject({ state: "medium" });
			expect(signals.complexity.value).not.toBe("");
		});

		it("derives Complexity critical when cyclomaticPerKloc >= 40", async () => {
			mockGraphql.mockResolvedValue(complexityResponse(45) as never);
			const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
			expect(signals.complexity).toMatchObject({ state: "critical" });
		});

		it("derives Complexity high when cyclomaticPerKloc >= 25 and < 40", async () => {
			mockGraphql.mockResolvedValue(complexityResponse(30) as never);
			const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
			expect(signals.complexity).toMatchObject({ state: "high" });
		});

		it("derives Complexity low when cyclomaticPerKloc < 15", async () => {
			mockGraphql.mockResolvedValue(complexityResponse(10) as never);
			const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
			expect(signals.complexity).toMatchObject({ state: "low" });
		});

		it("emits unavailable for Complexity when no timeseries points are returned", async () => {
			mockGraphql.mockResolvedValue({
				complexityTimeseries: { points: [], totalScope: 0 },
			} as never);
			const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
			expect(signals.complexity).toMatchObject({
				state: "unavailable",
				value: "",
			});
		});

		it("computes mean across multiple complexity points", async () => {
			// Two points: 20 + 40 → mean 30 → high (>=25, <40).
			mockGraphql.mockResolvedValue({
				complexityTimeseries: {
					points: [
						{
							date: "2026-05-25",
							scopeId: "repo-1",
							scopeName: "repo-one",
							cyclomaticPerKloc: 20,
							cyclomaticAvg: 10,
							cyclomaticTotal: 50,
							locTotal: 5000,
							highComplexityFunctions: 2,
							veryHighComplexityFunctions: 0,
						},
						{
							date: "2026-06-01",
							scopeId: "repo-1",
							scopeName: "repo-one",
							cyclomaticPerKloc: 40,
							cyclomaticAvg: 20,
							cyclomaticTotal: 100,
							locTotal: 5000,
							highComplexityFunctions: 4,
							veryHighComplexityFunctions: 1,
						},
					],
					totalScope: 1,
				},
			} as never);
			const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
			expect(signals.complexity).toMatchObject({ state: "high" });
		});
	});

	describe("unavailable signals (backend gaps)", () => {
		it("People is always unavailable (no area-level aggregate metric)", async () => {
			const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
			expect(signals.people).toMatchObject({ state: "unavailable", value: "" });
		});

		it("Landscape is always unavailable (CHAOS-2077 backend gap)", async () => {
			const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
			expect(signals.landscape).toMatchObject({
				state: "unavailable",
				value: "",
			});
		});

		it("Cognitive Load is always unavailable (CHAOS-2077 backend gap)", async () => {
			const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
			expect(signals["cognitive-load"]).toMatchObject({
				state: "unavailable",
				value: "",
			});
		});
	});

	describe("honest empty when source data is absent", () => {
		it("Metrics/Code/Bottlenecks emit unavailable when signals array is missing", async () => {
			mockGetHomeData.mockResolvedValue({
				deltas: [],
				signals: [],
			} as never);
			const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
			expect(signals.flow).toMatchObject({ state: "unavailable", value: "" });
			expect(signals.code).toMatchObject({ state: "unavailable", value: "" });
			expect(signals.bottleneck).toMatchObject({
				state: "unavailable",
				value: "",
			});
		});
	});

	describe("source-failure degradation", () => {
		it("degrades home-backed signals to unavailable when home fetch fails", async () => {
			mockGetHomeData.mockRejectedValue(new Error("home down"));
			const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
			expect(signals.flow).toMatchObject({ state: "unavailable", value: "" });
			expect(signals.code).toMatchObject({ state: "unavailable", value: "" });
			expect(signals.bottleneck).toMatchObject({
				state: "unavailable",
				value: "",
			});
			// Complexity is independent — still resolves if graphql is up.
			expect(signals.complexity.state).toBe("medium");
		});

		it("degrades Complexity to unavailable when graphql fetch fails", async () => {
			mockGraphql.mockRejectedValue(new Error("graphql down"));
			const signals = byId(await getDiagnoseSignals(defaultMetricFilter));
			expect(signals.complexity).toMatchObject({
				state: "unavailable",
				value: "",
			});
			// Home-backed signals still resolve.
			expect(signals.flow.state).toBe("low");
			expect(signals.code.state).toBe("high");
			expect(signals.bottleneck.state).toBe("critical");
		});

		it("does not throw when both sources fail simultaneously", async () => {
			mockGetHomeData.mockRejectedValue(new Error("home down"));
			mockGraphql.mockRejectedValue(new Error("graphql down"));
			const signals = await getDiagnoseSignals(defaultMetricFilter);
			expect(signals).toHaveLength(7);
			for (const s of signals) {
				if (!["people", "landscape", "cognitive-load"].includes(s.id)) {
					expect(s.state).toBe("unavailable");
				}
			}
		});
	});

	it("test-mode skips graphql and resolves complexity as unavailable", async () => {
		// In test mode, graphqlFetch is never called for complexity.
		const signals = byId(await getDiagnoseSignals(defaultMetricFilter, true));
		expect(mockGraphql).not.toHaveBeenCalled();
		expect(signals.complexity).toMatchObject({
			state: "unavailable",
			value: "",
		});
	});

	it("each signal has a non-empty label, href, and metricLabel", async () => {
		const signals = await getDiagnoseSignals(defaultMetricFilter);
		for (const s of signals) {
			expect(s.label).toBeTruthy();
			expect(s.href).toBeTruthy();
			expect(s.metricLabel).toBeTruthy();
		}
	});
});
