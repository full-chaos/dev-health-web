import { describe, expect, it } from "vitest";

import { buildWorkGraphTabs } from "./buildTabs";
import { defaultMetricFilter } from "@/lib/filters/defaults";

/** Parse the query string of a tab href into URLSearchParams. */
function queryOf(path: string): URLSearchParams {
    return new URLSearchParams(path.split("?")[1] ?? "");
}

describe("buildWorkGraphTabs", () => {
    const filters = defaultMetricFilter;

    it("does not add graph_theme/graph_subcategory when none are active", () => {
        const tabs = buildWorkGraphTabs({ filters });
        for (const tab of tabs) {
            const query = queryOf(tab.path);
            expect(query.has("graph_theme")).toBe(false);
            expect(query.has("graph_subcategory")).toBe(false);
            // The global filter is still carried.
            expect(query.has("f")).toBe(true);
        }
    });

    it("carries graph_theme + graph_subcategory onto every tab href when active", () => {
        const tabs = buildWorkGraphTabs({
            filters,
            graphTheme: "quality",
            graphSubcategory: "quality.bugfix",
        });

        expect(tabs.map((t) => t.id)).toEqual([
            "overview",
            "dependencies",
            "inflow-outflow",
            "review-network",
            "artifacts",
        ]);

        for (const tab of tabs) {
            const query = queryOf(tab.path);
            expect(query.get("graph_theme")).toBe("quality");
            expect(query.get("graph_subcategory")).toBe("quality.bugfix");
            // Global filter and per-tab `tab` param are preserved alongside.
            expect(query.has("f")).toBe(true);
        }

        // Non-overview tabs keep their `tab` discriminator.
        expect(queryOf(tabs[1].path).get("tab")).toBe("dependencies");
        expect(queryOf(tabs[2].path).get("tab")).toBe("inflow-outflow");
        expect(queryOf(tabs[4].path).get("tab")).toBe("artifacts");
    });

    it("carries only graph_theme when no subcategory is active", () => {
        const tabs = buildWorkGraphTabs({ filters, graphTheme: "quality" });
        for (const tab of tabs) {
            const query = queryOf(tab.path);
            expect(query.get("graph_theme")).toBe("quality");
            expect(query.has("graph_subcategory")).toBe(false);
        }
    });

    it("produces well-formed single-?-prefixed hrefs (no double ?)", () => {
        const tabs = buildWorkGraphTabs({
            filters,
            graphTheme: "quality",
            graphSubcategory: "quality.bugfix",
        });
        for (const tab of tabs) {
            // Exactly one "?" separates path from query.
            expect(tab.path.split("?").length).toBe(2);
        }
    });
});
