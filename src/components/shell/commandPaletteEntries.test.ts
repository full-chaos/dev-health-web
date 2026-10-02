import { describe, expect, it } from "vitest";

import { navAreas, isNavChildVisible, type NavArea } from "@/lib/navigation/areas";

import { filterPaletteEntries, paletteEntries } from "./commandPaletteEntries";

const area = (over: Partial<NavArea> & Pick<NavArea, "id" | "label" | "href">): NavArea =>
    ({
        placement: "main",
        ownedPathPrefixes: [over.href],
        legacyActiveIds: [],
        hubItems: [],
        children: [],
        ...over,
    }) as NavArea;

const sample: NavArea[] = [
    area({
        id: "diagnose",
        label: "Diagnose",
        href: "/diagnose",
        children: [
            { id: "flow", label: "Flow", path: "/metrics?tab=flow", navVisible: true },
            { id: "hidden", label: "Hidden page", path: "/hidden", navVisible: false },
            {
                id: "preview",
                label: "Preview page",
                path: "/preview",
                navVisible: false,
                preview: true,
            },
            {
                id: "gated",
                label: "Gated page",
                path: "/gated",
                navVisible: true,
                requiredFeature: "gated_feature",
            },
        ],
    }),
    area({ id: "admin", label: "Admin", href: "/org/admin", placement: "utility" }),
];

describe("paletteEntries", () => {
    it("lists areas and visible children in registry order, with the area as the second line", () => {
        const entries = paletteEntries(sample, {});
        expect(entries.map((e) => [e.label, e.areaLabel, e.path])).toEqual([
            ["Diagnose", "Diagnose", "/diagnose"],
            ["Flow", "Diagnose", "/metrics?tab=flow"],
            ["Admin", "Admin", "/org/admin"],
        ]);
    });

    it("leaves out hidden and preview children, and a gated child unless the org has the feature", () => {
        const without = paletteEntries(sample, {}).map((e) => e.label);
        expect(without).not.toContain("Hidden page");
        expect(without).not.toContain("Preview page");
        expect(without).not.toContain("Gated page");
        expect(paletteEntries(sample, { gated_feature: true }).map((e) => e.label)).toContain(
            "Gated page",
        );
        expect(paletteEntries(sample, { gated_feature: false }).map((e) => e.label)).not.toContain(
            "Gated page",
        );
    });

    it("on the real registry, offers exactly the areas and the children the sidebar would list", () => {
        const features: Record<string, boolean> = {};
        const entries = paletteEntries(navAreas, features);
        const labels = new Set(entries.map((e) => `${e.path}|${e.label}`));
        for (const a of navAreas) {
            expect(labels.has(`${a.href}|${a.label}`)).toBe(true);
            for (const child of a.children) {
                expect(labels.has(`${child.path}|${child.label}`)).toBe(
                    isNavChildVisible(child, features),
                );
            }
        }
        // Every entry comes from the registry: nothing invented.
        const known = new Set<string>();
        for (const a of navAreas) {
            known.add(`${a.href}|${a.label}`);
            for (const c of a.children) known.add(`${c.path}|${c.label}`);
        }
        for (const e of entries) expect(known.has(`${e.path}|${e.label}`)).toBe(true);
    });

    it("lists no destination twice", () => {
        const entries = paletteEntries(navAreas, {});
        const keys = entries.map((e) => `${e.path}|${e.label}`);
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe("filterPaletteEntries", () => {
    const entries = paletteEntries(sample, {});

    it("returns everything for an empty query", () => {
        expect(filterPaletteEntries(entries, "  ")).toEqual(entries);
    });

    it("matches case-insensitively on the label or the area, every word", () => {
        expect(filterPaletteEntries(entries, "FLOW").map((e) => e.label)).toEqual(["Flow"]);
        expect(filterPaletteEntries(entries, "diagnose flow").map((e) => e.label)).toEqual([
            "Flow",
        ]);
        expect(filterPaletteEntries(entries, "diagnose").map((e) => e.label)).toEqual([
            "Diagnose",
            "Flow",
        ]);
        expect(filterPaletteEntries(entries, "nothing here")).toEqual([]);
    });
});
