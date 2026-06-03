import { describe, expect, it } from "vitest";

import { AI_CATEGORY, isAiDominant, topSignal } from "@/lib/cockpit/aiGate";

describe("topSignal", () => {
	it("returns undefined for empty or missing input", () => {
		expect(topSignal(undefined)).toBeUndefined();
		expect(topSignal(null)).toBeUndefined();
		expect(topSignal([])).toBeUndefined();
	});

	it("returns the first (pre-sorted) signal as the top signal", () => {
		const top = topSignal([{ category: "delivery" }, { category: "ai" }]);
		expect(top?.category).toBe("delivery");
	});
});

describe("isAiDominant", () => {
	it("returns false for null/undefined input (absence is never AI dominance)", () => {
		expect(isAiDominant(null)).toBe(false);
		expect(isAiDominant(undefined)).toBe(false);
	});

	it("returns false for empty or missing signals", () => {
		expect(isAiDominant({ signals: [] })).toBe(false);
		expect(isAiDominant({ signals: null })).toBe(false);
		expect(isAiDominant({})).toBe(false);
	});

	it("is AI-dominant when the top (index 0) signal is the ai category", () => {
		expect(
			isAiDominant({ signals: [{ category: "ai" }, { category: "delivery" }] }),
		).toBe(true);
	});

	it("is AI-dominant for a single ai signal", () => {
		expect(isAiDominant({ signals: [{ category: AI_CATEGORY }] })).toBe(true);
	});

	it("is NOT AI-dominant when a non-ai signal is on top, even if ai appears later", () => {
		expect(
			isAiDominant({
				signals: [{ category: "delivery" }, { category: "ai" }],
			}),
		).toBe(false);
	});

	it("matches the ai category exactly (no case folding)", () => {
		expect(isAiDominant({ signals: [{ category: "AI" }] })).toBe(false);
		expect(isAiDominant({ signals: [{ category: "ai" }] })).toBe(true);
	});
});
