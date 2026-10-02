import { describe, expect, it } from "vitest";

import { navAreas, isNavChildVisible, type NavArea } from "@/lib/navigation/areas";

import { TAB_SETS, getTabSet, tabHref, type TabSet } from "@/lib/navigation/tabs";

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
        const entries = paletteEntries(sample, {}, []);
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
        // ...and the tab registry's tabs (their links come from `tabHref`).
        const sets: readonly TabSet[] = TAB_SETS;
        for (const set of sets) {
            for (const tab of set.tabs) known.add(`${tabHref(set, tab.id)}|${tab.label}`);
        }
        for (const e of entries) expect(known.has(`${e.path}|${e.label}`)).toBe(true);
    });

    it("lists a destination's tabs after it: the non-default tabs, with the destination and area as the second line", () => {
        const entries = paletteEntries(navAreas, {});
        const set = getTabSet("complexity");
        const flame = entries.find((e) => e.path === "/complexity?tab=flame");
        expect(flame).toMatchObject({ label: "Flame", areaLabel: "Complexity · Diagnose" });
        // The default tab is the destination row, not a second row.
        expect(entries.filter((e) => e.path === "/complexity")).toHaveLength(1);
        // Order: the destination, then its tabs in registry order.
        const at = entries.findIndex((e) => e.path === "/complexity");
        expect(entries.slice(at + 1, at + set.tabs.length).map((e) => e.label)).toEqual(
            set.tabs.slice(1).map((t) => t.label),
        );
        expect(entries.find((e) => e.path === "/cognitive-load?tab=load-drivers")?.label).toBe(
            "Load Drivers",
        );
        // AI Governance Risk: the `view` tabs, second line names the destination and the area.
        expect(entries.find((e) => e.path === "/ai/risk?view=test-gaps")).toMatchObject({
            label: "Test Gaps",
            areaLabel: "Governance Risk · AI",
        });
        expect(entries.find((e) => e.path === "/ai/risk?view=evidence")?.label).toBe("Evidence");
        expect(entries.filter((e) => e.path === "/ai/risk")).toHaveLength(1);
        // Metrics: the sidebar's Flow row is itself a tab; DORA and Throughput are added, Flow not twice.
        expect(entries.find((e) => e.path === "/metrics?tab=dora")).toMatchObject({
            label: "DORA",
            areaLabel: "Flow · Diagnose",
        });
        expect(entries.find((e) => e.path === "/metrics?tab=throughput")?.label).toBe("Throughput");
        expect(entries.filter((e) => e.path === "/metrics?tab=flow")).toHaveLength(1);
        // TestOps: route tabs, listed after the TestOps destination (Overview is the destination row).
        expect(entries.find((e) => e.path === "/testops/pipelines")).toMatchObject({
            label: "Pipelines",
            areaLabel: "TestOps · Govern",
        });
        expect(entries.filter((e) => e.path === "/testops")).toHaveLength(1);
        // The Diagnose pages moved onto the registry in part 2.
        expect(entries.find((e) => e.path === "/investment?tab=allocation")).toMatchObject({
            label: "Allocation",
            areaLabel: "Investment · Diagnose",
        });
        expect(entries.find((e) => e.path === "/landscape?tab=teams")?.label).toBe("Teams");
        expect(
            entries.find((e) => e.path === "/diagnose/work-graph?tab=review-network")?.label,
        ).toBe("Review Network");
    });

    it("lists the tabs of a destination only when the sidebar would list the destination", () => {
        const sets = [
            {
                id: "x",
                areaId: "diagnose",
                basePath: "/gated",
                param: "tab",
                defaultTabId: "a",
                tabs: [
                    { id: "a", label: "A" },
                    { id: "b", label: "B tab" },
                ],
            },
            {
                id: "y",
                areaId: "diagnose",
                basePath: "/hidden",
                param: "tab",
                defaultTabId: "a",
                tabs: [
                    { id: "a", label: "A" },
                    { id: "b", label: "Hidden tab" },
                ],
            },
        ] as const;
        // "/gated" needs a feature; "/hidden" is not in the menu at all.
        const without = paletteEntries(sample, {}, sets).map((e) => e.label);
        expect(without).not.toContain("B tab");
        expect(without).not.toContain("Hidden tab");
        const withFeature = paletteEntries(sample, { gated_feature: true }, sets).map(
            (e) => e.label,
        );
        expect(withFeature).toContain("B tab");
        expect(withFeature).not.toContain("Hidden tab");
    });

    it("lists the Admin tabs after their destination, and a feature tab only with its feature", () => {
        const plain = paletteEntries(navAreas, {});
        expect(plain.find((e) => e.path === "/org/admin/users")).toMatchObject({
            label: "Users",
            areaLabel: "Organization · Admin",
        });
        expect(plain.find((e) => e.path === "/org/admin/integrations")).toMatchObject({
            label: "Providers",
            areaLabel: "Connections · Admin",
        });
        // Overview and Sync Status are the destination rows themselves (no second row for them).
        expect(plain.filter((e) => e.path === "/org/admin").map((e) => e.label)).toEqual([
            "Admin",
            "Organization",
        ]);
        expect(plain.filter((e) => e.path === "/org/admin/sync").map((e) => e.label)).toEqual([
            "Connections",
        ]);
        // The four entitlement tabs need their feature, as in the old admin sidebar.
        const gated = [
            "/org/admin/audit-logs",
            "/org/admin/ip-allowlist",
            "/org/admin/retention",
            "/org/admin/ai",
        ];
        for (const path of gated)
            expect(
                plain.find((e) => e.path === path),
                path,
            ).toBeUndefined();
        const all = paletteEntries(navAreas, {
            audit_log: true,
            ip_allowlist: true,
            custom_retention: true,
            byo_llm: true,
        });
        for (const path of gated)
            expect(
                all.find((e) => e.path === path),
                path,
            ).toBeDefined();
        expect(
            paletteEntries(navAreas, { byo_llm: true }).find((e) => e.path === "/org/admin/ai"),
        ).toMatchObject({
            label: "AI Setup",
            areaLabel: "Organization · Admin",
        });
    });

    it("lists no destination twice", () => {
        const entries = paletteEntries(navAreas, {});
        const keys = entries.map((e) => `${e.path}|${e.label}`);
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe("filterPaletteEntries", () => {
    const entries = paletteEntries(sample, {}, []);

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

    it("finds a tab by its name or by its destination", () => {
        const all = paletteEntries(navAreas, {});
        expect(filterPaletteEntries(all, "flame").map((e) => e.path)).toContain(
            "/complexity?tab=flame",
        );
        expect(filterPaletteEntries(all, "complexity flame").map((e) => e.path)).toEqual([
            "/complexity?tab=flame",
        ]);
    });
});
