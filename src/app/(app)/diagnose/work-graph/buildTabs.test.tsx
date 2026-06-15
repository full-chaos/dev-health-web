import { describe, expect, it } from "vitest";

import { buildWorkGraphTabs } from "./buildTabs";
import { defaultMetricFilter } from "@/lib/filters/defaults";

/** Parse the query string of a tab href into URLSearchParams. */
function queryOf(path: string): URLSearchParams {
    return new URLSearchParams(path.split("?")[1] ?? "");
}

describe("buildWorkGraphTabs", () => {
    const filters = defaultMetricFilter;

    // Theme-aware tabs read the theme-filtered work_graph edges; review-network
    // is backed by review_edges_daily (no theme attribution), so it must NOT
    // carry the theme params (CHAOS-2431, round-5).
    const THEME_AWARE = ["overview", "dependencies", "inflow-outflow", "artifacts"];
    const tabById = (tabs: ReturnType<typeof buildWorkGraphTabs>, id: string) =>
        tabs.find((t) => t.id === id)!;

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

    it("carries graph_theme + graph_subcategory onto theme-aware tab hrefs when active", () => {
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

        for (const id of THEME_AWARE) {
            const query = queryOf(tabById(tabs, id).path);
            expect(query.get("graph_theme")).toBe("quality");
            expect(query.get("graph_subcategory")).toBe("quality.bugfix");
            // Global filter and per-tab `tab` param are preserved alongside.
            expect(query.has("f")).toBe(true);
        }

        // Non-overview tabs keep their `tab` discriminator.
        expect(queryOf(tabById(tabs, "dependencies").path).get("tab")).toBe("dependencies");
        expect(queryOf(tabById(tabs, "inflow-outflow").path).get("tab")).toBe("inflow-outflow");
        expect(queryOf(tabById(tabs, "artifacts").path).get("tab")).toBe("artifacts");
    });

    it("does NOT carry graph_theme/graph_subcategory onto the review-network tab", () => {
        const tabs = buildWorkGraphTabs({
            filters,
            graphTheme: "quality",
            graphSubcategory: "quality.bugfix",
        });

        const reviewQuery = queryOf(tabById(tabs, "review-network").path);
        // review_edges_daily has no theme attribution, so the URL must not
        // advertise a theme scope it cannot honor.
        expect(reviewQuery.has("graph_theme")).toBe(false);
        expect(reviewQuery.has("graph_subcategory")).toBe(false);
        // It still carries the global filter and its own tab discriminator.
        expect(reviewQuery.has("f")).toBe(true);
        expect(reviewQuery.get("tab")).toBe("review-network");
    });

    it("carries only graph_theme onto theme-aware tabs when no subcategory is active", () => {
        const tabs = buildWorkGraphTabs({ filters, graphTheme: "quality" });
        for (const id of THEME_AWARE) {
            const query = queryOf(tabById(tabs, id).path);
            expect(query.get("graph_theme")).toBe("quality");
            expect(query.has("graph_subcategory")).toBe(false);
        }
        // review-network still excluded.
        const reviewQuery = queryOf(tabById(tabs, "review-network").path);
        expect(reviewQuery.has("graph_theme")).toBe(false);
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
