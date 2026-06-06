import { describe, it, expect } from "vitest";

import {
	getLensConfig,
	getLensFromSearchParams,
	applyLensPriority,
	getLandscapePrimaryType,
} from "@/lib/lensContext";

// ---------------------------------------------------------------------------
// getLensConfig
// ---------------------------------------------------------------------------

describe("getLensConfig", () => {
	it("returns neutral config for undefined", () => {
		const config = getLensConfig(undefined);
		expect(config.id).toBe("neutral");
		expect(config.framing).toBe("");
		expect(config.investigationOrder).toHaveLength(0);
	});

	it("returns neutral config for null", () => {
		const config = getLensConfig(null);
		expect(config.id).toBe("neutral");
	});

	it('returns neutral config for "neutral"', () => {
		const config = getLensConfig("neutral");
		expect(config.id).toBe("neutral");
		expect(config.primaryQuadrant).toBeNull();
		expect(config.secondaryQuadrant).toBeNull();
	});

	it("returns correct config for 'em'", () => {
		const config = getLensConfig("em");
		expect(config.id).toBe("em");
		expect(config.label).toBe("Engineering Manager");
		expect(config.shortLabel).toBe("EM");
		expect(config.framing).toContain("flow");
		expect(config.primaryQuadrant).toBe("wip_throughput");
		expect(config.investigationOrder).toContain("wip");
	});

	it("returns neutral config for an unknown lens string", () => {
		const config = getLensConfig("unknown-role");
		expect(config.id).toBe("neutral");
	});

	it.each([
		"ic",
		"em",
		"pm",
		"leadership",
	] as const)("returns non-empty investigationOrder for role lens '%s'", (role) => {
		const config = getLensConfig(role);
		expect(config.investigationOrder.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// getLensFromSearchParams — lens= vs role= alias precedence
// ---------------------------------------------------------------------------

describe("getLensFromSearchParams", () => {
	it("returns null when no params are set", () => {
		expect(getLensFromSearchParams(new URLSearchParams())).toBeNull();
	});

	it("reads lens= param first", () => {
		const params = new URLSearchParams({ lens: "em", role: "ic" });
		expect(getLensFromSearchParams(params)).toBe("em");
	});

	it("falls back to role= when lens= is absent", () => {
		const params = new URLSearchParams({ role: "pm" });
		expect(getLensFromSearchParams(params)).toBe("pm");
	});

	it("returns null when role= is invalid", () => {
		const params = new URLSearchParams({ role: "cto" });
		expect(getLensFromSearchParams(params)).toBeNull();
	});

	it('returns "neutral" for lens=neutral', () => {
		const params = new URLSearchParams({ lens: "neutral" });
		expect(getLensFromSearchParams(params)).toBe("neutral");
	});

	it("ignores role= when lens= is valid", () => {
		const params = new URLSearchParams({ lens: "leadership", role: "em" });
		expect(getLensFromSearchParams(params)).toBe("leadership");
	});

	it("returns null for invalid lens= and no role=", () => {
		const params = new URLSearchParams({ lens: "wizard" });
		expect(getLensFromSearchParams(params)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// applyLensPriority
// ---------------------------------------------------------------------------

describe("applyLensPriority", () => {
	const items = [
		{ id: "wip" },
		{ id: "review" },
		{ id: "churn" },
		{ id: "investment" },
		{ id: "cycle" },
	] as const;

	it("preserves order when lens is neutral", () => {
		const result = applyLensPriority(items, "neutral", "cockpit");
		expect(result.map((i) => i.id)).toEqual([
			"wip",
			"review",
			"churn",
			"investment",
			"cycle",
		]);
	});

	it("reorders by em investigationOrder: wip, review, cycle, investment", () => {
		const result = applyLensPriority(items, "em", "explore");
		expect(result[0].id).toBe("wip");
		expect(result[1].id).toBe("review");
		expect(result[2].id).toBe("cycle");
		expect(result[3].id).toBe("investment");
	});

	it("reorders by leadership investigationOrder: investment, churn, cycle, wip", () => {
		const result = applyLensPriority(items, "leadership", "explore");
		expect(result[0].id).toBe("investment");
		expect(result[1].id).toBe("churn");
		expect(result[2].id).toBe("cycle");
		expect(result[3].id).toBe("wip");
	});

	it("appends unknown ids at the end", () => {
		const withExtra = [...items, { id: "unknown_metric" }];
		const result = applyLensPriority(withExtra, "em", "explore");
		expect(result[result.length - 1].id).toBe("unknown_metric");
	});

	it("does not mutate input array", () => {
		const original = [{ id: "churn" }, { id: "wip" }];
		applyLensPriority(original, "em", "cockpit");
		expect(original[0].id).toBe("churn");
		expect(original[1].id).toBe("wip");
	});
});

// ---------------------------------------------------------------------------
// getLandscapePrimaryType — clamped to Landscape-safe set
// ---------------------------------------------------------------------------

describe("getLandscapePrimaryType", () => {
	it('returns "cycle_throughput" for neutral lens', () => {
		expect(getLandscapePrimaryType("neutral")).toBe("cycle_throughput");
	});

	it('returns "cycle_throughput" for ic (primaryQuadrant: review_load_latency — not in landscape)', () => {
		expect(getLandscapePrimaryType("ic")).toBe("cycle_throughput");
	});

	it('returns "cycle_throughput" for em (primaryQuadrant: wip_throughput — not in landscape)', () => {
		expect(getLandscapePrimaryType("em")).toBe("cycle_throughput");
	});

	it('returns "cycle_throughput" for pm (primaryQuadrant: wip_throughput — not in landscape)', () => {
		expect(getLandscapePrimaryType("pm")).toBe("cycle_throughput");
	});

	it('returns "churn_throughput" for leadership (primaryQuadrant: churn_throughput — in landscape)', () => {
		expect(getLandscapePrimaryType("leadership")).toBe("churn_throughput");
	});
});
