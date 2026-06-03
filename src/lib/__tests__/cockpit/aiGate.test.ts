import { describe, expect, it } from "vitest";

import { AI_CATEGORY, isAiDominant, topSignal } from "@/lib/cockpit/aiGate";

describe("topSignal", () => {
	it("returns undefined for empty or missing input", () => {
		expect(topSignal(undefined)).toBeUndefined();
		expect(topSignal(null)).toBeUndefined();
		expect(topSignal([])).toBeUndefined();
	});

	it("treats array as pre-sorted when no weights present (index 0 wins)", () => {
		const top = topSignal([{ category: "delivery" }, { category: "ai" }]);
		expect(top?.category).toBe("delivery");
	});

	it("picks the highest-weight signal when weights present", () => {
		const top = topSignal([
			{ category: "delivery", weight: 0.2 },
			{ category: "ai", weight: 0.7 },
			{ category: "quality", weight: 0.1 },
		]);
		expect(top?.category).toBe("ai");
	});

	it("breaks weight ties by earliest array index", () => {
		const top = topSignal([
			{ category: "delivery", weight: 0.5 },
			{ category: "ai", weight: 0.5 },
		]);
		expect(top?.category).toBe("delivery");
	});

	it("ranks an explicitly weighted signal above an unweighted one", () => {
		const top = topSignal([
			{ category: "delivery" },
			{ category: "ai", weight: 0.01 },
		]);
		expect(top?.category).toBe("ai");
	});
});

describe("isAiDominant", () => {
	it("returns false for null/undefined input (absence is never AI dominance)", () => {
		expect(isAiDominant(null)).toBe(false);
		expect(isAiDominant(undefined)).toBe(false);
	});

	it("returns false for empty signals and no health driver", () => {
		expect(isAiDominant({ signals: [] })).toBe(false);
		expect(isAiDominant({ signals: null, health_state: null })).toBe(false);
	});

	it("is AI-dominant when health_state.driver_category is ai", () => {
		expect(
			isAiDominant({
				health_state: { driver_category: AI_CATEGORY },
				signals: [{ category: "delivery", weight: 0.9 }],
			}),
		).toBe(true);
	});

	it("is AI-dominant when the top-ranked signal is ai", () => {
		expect(
			isAiDominant({
				signals: [
					{ category: "delivery", weight: 0.2 },
					{ category: "ai", weight: 0.8 },
				],
			}),
		).toBe(true);
	});

	it("is AI-dominant when ai is the first signal and no weights are present", () => {
		expect(
			isAiDominant({ signals: [{ category: "ai" }, { category: "delivery" }] }),
		).toBe(true);
	});

	it("is NOT AI-dominant when a non-ai signal outranks ai", () => {
		expect(
			isAiDominant({
				signals: [
					{ category: "delivery", weight: 0.9 },
					{ category: "ai", weight: 0.1 },
				],
			}),
		).toBe(false);
	});

	it("is NOT AI-dominant when health driver is a non-ai category", () => {
		expect(
			isAiDominant({
				health_state: { driver_category: "quality" },
				signals: [{ category: "delivery" }],
			}),
		).toBe(false);
	});

	it("is case-insensitive on category matching", () => {
		expect(isAiDominant({ signals: [{ category: "AI" }] })).toBe(true);
		expect(isAiDominant({ health_state: { driver_category: "Ai" } })).toBe(
			true,
		);
	});
});
