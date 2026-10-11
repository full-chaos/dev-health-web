import { afterEach, describe, expect, it, vi } from "vitest";

import {
    resolveEntityLabel,
    chartEntityLabel,
    resolveEntityLabels,
    scrubIdentifiers,
} from "@/lib/labels/entityLabel";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const HEX32 = "550e8400e29b41d4a716446655440000";

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("resolveEntityLabel", () => {
    it("prefers an explicit name and tooltip is the name, never the id", () => {
        const result = resolveEntityLabel(UUID, { name: "Web App" });
        expect(result).toEqual({ label: "Web App", title: "Web App", resolved: true });
    });

    it("resolves via a nameMap lookup", () => {
        const result = resolveEntityLabel(UUID, {
            nameMap: { [UUID]: "Frontend Web" },
        });
        expect(result.label).toBe("Frontend Web");
        expect(result.title).toBe(result.label);
        expect(result.resolved).toBe(true);
    });

    it("NEVER renders an ID — the label says Unresolved, the tooltip never has the id", () => {
        const result = resolveEntityLabel(UUID);
        expect(result.label).toBe("Unresolved");
        expect(result.title).toBe(result.label);
        expect(result.resolved).toBe(false);
    });

    it("degrades a 32-char hex id the same way", () => {
        const result = resolveEntityLabel(HEX32);
        expect(result.label).toBe("Unresolved");
        expect(result.title).toBe(result.label);
        expect(result.resolved).toBe(false);
    });

    it.each([`jira:${UUID}`, "gh:platform-team", "linear:ENG", `github:${UUID}`])(
        "degrades the provider-keyed id %s",
        (id) => {
            expect(resolveEntityLabel(id).label).toBe("Unresolved");
            expect(resolveEntityLabel(id).title).toBe("Unresolved");
            expect(resolveEntityLabel(id, { name: "Platform" }).label).toBe("Platform");
        },
    );

    it("is stable: the same UUID always degrades to the same label", () => {
        expect(resolveEntityLabel(UUID).label).toBe(resolveEntityLabel(UUID).label);
    });

    it("degrades a prefixed UUID without printing the prefix or the id", () => {
        const result = resolveEntityLabel(`repo:${UUID}`);
        expect(result.label).toBe("Unresolved");
        expect(result.title).toBe(result.label);
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
        expect(resolveEntityLabel(undefined, { fallback: "No repo" }).label).toBe("No repo");
    });

    it("honours an explicit unresolved fallback and never throws in development", () => {
        vi.stubEnv("NODE_ENV", "development");
        expect(resolveEntityLabel(UUID).label).toBe("Unresolved");
        expect(resolveEntityLabel(UUID, { unresolvedFallback: "No name" })).toEqual({
            label: "No name",
            title: "No name",
            resolved: false,
        });
    });
});

describe("resolveEntityLabels", () => {
    it("returns column-aligned labels and titles for chart axes", () => {
        const { labels, titles } = resolveEntityLabels(["frontend-web", UUID, "repo:web-app"]);
        expect(labels).toEqual(["frontend-web", "Unresolved", "web-app"]);
        expect(titles).toEqual(["frontend-web", "Unresolved", "web-app"]);
        // No raw UUID survives as a primary label.
        expect(labels).not.toContain(UUID);
    });

    it("supports a per-item options function (e.g. names carried on data)", () => {
        const names = ["Frontend Web", undefined];
        const { labels, results } = resolveEntityLabels([UUID, "backend-api"], (_id, i) => ({
            name: names[i],
        }));
        expect(labels[0]).toBe("Frontend Web");
        expect(results[0].resolved).toBe(true);
        expect(labels[1]).toBe("backend-api");
    });

    it("degrades a bare UUID to Unresolved and never throws in development", () => {
        vi.stubEnv("NODE_ENV", "development");
        const { labels, titles } = resolveEntityLabels([UUID, "repo:web-app"]);
        expect(labels).toEqual(["Unresolved", "web-app"]);
        expect(titles).toEqual(["Unresolved", "web-app"]);
    });
});

describe("scrubIdentifiers", () => {
    it("replaces a UUID embedded in narrative prose with a plain phrase", () => {
        const { text, changed } = scrubIdentifiers(
            `Compounding risk appears elevated for ${UUID} across ${UUID}`,
        );
        expect(changed).toBe(true);
        expect(text).toBe(
            "Compounding risk appears elevated for an unresolved item across an unresolved item",
        );
        expect(text).not.toContain(UUID);
    });

    it("replaces an embedded 32-char hex id", () => {
        const { text, changed } = scrubIdentifiers(`risk in ${HEX32} today`);
        expect(changed).toBe(true);
        expect(text).toBe("risk in an unresolved item today");
    });

    it("takes the provider key with the id", () => {
        expect(scrubIdentifiers(`congestion for jira:${UUID}`).text).toBe(
            "congestion for an unresolved item",
        );
        expect(scrubIdentifiers("churn in gh:acme-web now").text).toBe(
            "churn in an unresolved item now",
        );
        expect(scrubIdentifiers("Jira: slow queue").changed).toBe(false);
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

describe("chartEntityLabel", () => {
    it("returns a confident human label unchanged", () => {
        expect(chartEntityLabel("frontend-web")).toBe("frontend-web");
    });

    it("strips a known prefix from a readable slug", () => {
        expect(chartEntityLabel("repo:web-app")).toBe("web-app");
    });

    it("NEVER returns an ID — degrades to Unresolved", () => {
        expect(chartEntityLabel(UUID)).toBe("Unresolved");
    });

    it("degrades a prefixed UUID without printing the prefix or the id", () => {
        expect(chartEntityLabel(`repo:${UUID}`)).toBe("Unresolved");
    });

    it("degrades a 32-char hex id", () => {
        expect(chartEntityLabel(HEX32)).toBe("Unresolved");
    });

    it("honours an explicit name when one resolves", () => {
        expect(chartEntityLabel(UUID, { name: "Web App" })).toBe("Web App");
    });

    it("falls back safely for empty ids without leaking a raw token", () => {
        expect(chartEntityLabel("")).toBe("Unknown");
        expect(chartEntityLabel(undefined)).toBe("Unknown");
    });

    it("never throws in development for an unresolved id", () => {
        vi.stubEnv("NODE_ENV", "development");
        expect(() => chartEntityLabel(UUID)).not.toThrow();
        expect(chartEntityLabel(UUID)).toBe("Unresolved");
    });
});
