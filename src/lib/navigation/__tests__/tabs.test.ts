import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { getAreaById, isNavChildVisible } from "../areas";
import { TAB_SETS, getTabSet, tabHref } from "../tabs";

const appRoot = join(process.cwd(), "src/app/(app)");

// The tab lists the two pages carried inline before the registry: the registry must say exactly this
// (same ids, same labels, same order). This is the pin that used to be the page source text.
const BEFORE = {
    complexity: [
        ["overview", "Overview"],
        ["flame", "Flame"],
        ["hotspots", "Hotspots"],
        ["ownership-risk", "Ownership Risk"],
        ["churn", "Churn"],
    ],
    "cognitive-load": [
        ["overview", "Overview"],
        ["heatmap", "Heatmap"],
        ["context-switching", "Context Switching"],
        ["focus-pressure", "Focus Pressure"],
        ["load-drivers", "Load Drivers"],
    ],
} as const;

describe("tab registry", () => {
    it.each(Object.entries(BEFORE))(
        "holds the %s tabs exactly as the page listed them",
        (id, tabs) => {
            const set = getTabSet(id as keyof typeof BEFORE);
            expect(set.tabs.map((tab) => [tab.id, tab.label])).toEqual(tabs);
        },
    );

    it("has unique set ids and unique tab ids per set, and a default tab that exists", () => {
        expect(new Set(TAB_SETS.map((s) => s.id)).size).toBe(TAB_SETS.length);
        for (const set of TAB_SETS) {
            const ids = set.tabs.map((t) => t.id);
            expect(new Set(ids).size, set.id).toBe(ids.length);
            expect(ids, set.id).toContain(set.defaultTabId);
        }
    });

    it("builds the default tab without a query value and the others with the parameter", () => {
        const set = getTabSet("complexity");
        expect(tabHref(set, "overview")).toBe("/complexity");
        expect(tabHref(set, "flame")).toBe("/complexity?tab=flame");
        expect(tabHref(set, "ownership-risk")).toBe("/complexity?tab=ownership-risk");
        expect(tabHref(getTabSet("cognitive-load"), "load-drivers")).toBe(
            "/cognitive-load?tab=load-drivers",
        );
    });

    it("names a destination the sidebar lists: every set's base path is a visible navAreas child", () => {
        for (const set of TAB_SETS) {
            const child = getAreaById(set.areaId)?.children.find((c) => c.path === set.basePath);
            expect(child, set.id).toBeDefined();
            expect(isNavChildVisible(child!, {}), set.id).toBe(true);
        }
    });

    it.each(["complexity", "cognitive-load"] as const)(
        "%s page renders its tabs from the registry and holds no inline list",
        (page) => {
            const source = readFileSync(join(appRoot, page, "page.tsx"), "utf8");
            expect(source).toContain(`getTabSet("${page}")`);
            expect(source).toContain("tabHref(tabSet, tab.id)");
            // No tab literal of the old inline list is left in the page.
            for (const [id, label] of BEFORE[page]) {
                expect(source).not.toContain(`id: "${id}"`);
                expect(source).not.toContain(`label: "${label}"`);
            }
        },
    );
});
