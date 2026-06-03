import { afterEach, describe, expect, it, vi } from "vitest";

import {
	resolveEntityLabel,
	resolveEntityLabels,
	scrubIdentifiers,
} from "@/lib/labels/entityLabel";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const HEX32 = "550e8400e29b41d4a716446655440000";

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("resolveEntityLabel", () => {
	it("prefers an explicit name and keeps the full id as the tooltip title", () => {
		const result = resolveEntityLabel(UUID, { name: "Web App" });
		expect(result).toEqual({ label: "Web App", title: UUID, resolved: true });
	});

	it("resolves via a nameMap lookup", () => {
		const result = resolveEntityLabel(UUID, {
			nameMap: { [UUID]: "Frontend Web" },
		});
		expect(result.label).toBe("Frontend Web");
		expect(result.title).toBe(UUID);
		expect(result.resolved).toBe(true);
	});

	it("NEVER renders a bare UUID — degrades to a stable short label + tooltip", () => {
		const result = resolveEntityLabel(UUID);
		expect(result.label).not.toBe(UUID);
		expect(result.label).toBe("#550e8400");
		expect(result.title).toBe(UUID);
		expect(result.resolved).toBe(false);
	});

	it("degrades a 32-char hex id the same way", () => {
		const result = resolveEntityLabel(HEX32);
		expect(result.label).toBe("#550e8400");
		expect(result.title).toBe(HEX32);
		expect(result.resolved).toBe(false);
	});

	it("is stable: the same UUID always degrades to the same short label", () => {
		expect(resolveEntityLabel(UUID).label).toBe(resolveEntityLabel(UUID).label);
	});

	it("degrades a prefixed UUID while preserving the entity prefix", () => {
		const result = resolveEntityLabel(`repo:${UUID}`);
		expect(result.label).toBe("repo·550e8400");
		expect(result.title).toBe(`repo:${UUID}`);
		expect(result.resolved).toBe(false);
	});

	it("strips a known prefix from a readable slug (repo:web-app -> web-app)", () => {
		const result = resolveEntityLabel("repo:web-app");
		expect(result.label).toBe("web-app");
		expect(result.resolved).toBe(true);
	});

	it("takes the last segment of a path-like id (org/web-app -> web-app)", () => {
		expect(resolveEntityLabel("acme-org/web-app").label).toBe("web-app");
		expect(resolveEntityLabel("a/b/c/file.ts").label).toBe("file.ts");
	});

	it("passes through an already human-readable slug", () => {
		const result = resolveEntityLabel("frontend-web");
		expect(result.label).toBe("frontend-web");
		expect(result.resolved).toBe(true);
	});

	it("falls back to a safe label for empty / null / undefined ids", () => {
		for (const empty of [undefined, null, "", "   "]) {
			const result = resolveEntityLabel(empty);
			expect(result.label).toBe("Unknown");
			expect(result.resolved).toBe(false);
		}
	});

	it("honours a custom fallback for missing ids", () => {
		expect(resolveEntityLabel(undefined, { fallback: "No repo" }).label).toBe(
			"No repo",
		);
	});

	it("throws in development when UUID-like ids have no display name or explicit unresolved fallback", () => {
		vi.stubEnv("NODE_ENV", "development");
		expect(() => resolveEntityLabel(UUID)).toThrow(/unresolved id/u);
		expect(
			resolveEntityLabel(UUID, { unresolvedFallback: "Unresolved" }),
		).toEqual({
			label: "Unresolved",
			title: UUID,
			resolved: false,
			short: "#550e8400",
		});
	});
});

describe("resolveEntityLabels", () => {
	it("returns column-aligned labels and titles for chart axes", () => {
		const { labels, titles } = resolveEntityLabels([
			"frontend-web",
			UUID,
			"repo:web-app",
		]);
		expect(labels).toEqual(["frontend-web", "#550e8400", "web-app"]);
		expect(titles).toEqual(["frontend-web", UUID, "repo:web-app"]);
		// No raw UUID survives as a primary label.
		expect(labels).not.toContain(UUID);
	});

	it("supports a per-item options function (e.g. names carried on data)", () => {
		const names = ["Frontend Web", undefined];
		const { labels, results } = resolveEntityLabels(
			[UUID, "backend-api"],
			(_id, i) => ({
				name: names[i],
			}),
		);
		expect(labels[0]).toBe("Frontend Web");
		expect(results[0].resolved).toBe(true);
		expect(labels[1]).toBe("backend-api");
	});
});

describe("scrubIdentifiers", () => {
	it("replaces a UUID embedded in narrative prose with a stable short token", () => {
		const { text, changed } = scrubIdentifiers(
			`Compounding risk appears elevated for ${UUID} across ${UUID}`,
		);
		expect(changed).toBe(true);
		expect(text).toBe(
			"Compounding risk appears elevated for #550e8400 across #550e8400",
		);
		expect(text).not.toContain(UUID);
	});

	it("replaces an embedded 32-char hex id", () => {
		const { text, changed } = scrubIdentifiers(`risk in ${HEX32} today`);
		expect(changed).toBe(true);
		expect(text).toBe("risk in #550e8400 today");
	});

	it("leaves clean prose untouched", () => {
		const clean = "Review latency is the limiting factor this week";
		expect(scrubIdentifiers(clean)).toEqual({ text: clean, changed: false });
	});

	it("is a no-op for empty / nullish input", () => {
		expect(scrubIdentifiers("")).toEqual({ text: "", changed: false });
		expect(scrubIdentifiers(null)).toEqual({ text: "", changed: false });
		expect(scrubIdentifiers(undefined)).toEqual({ text: "", changed: false });
	});
});
