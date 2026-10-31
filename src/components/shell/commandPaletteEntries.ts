import {
    isNavAreaVisible,
    isNavChildVisible,
    type NavArea,
    type NavViewer,
} from "@/lib/navigation/areas";
import { TAB_SETS, isTabVisible, tabHref, type TabSet } from "@/lib/navigation/tabs";

export type PaletteEntry = {
    /** Unique row id (also the DOM id suffix). */
    id: string;
    label: string;
    /** The area the destination belongs to (the secondary line). */
    areaLabel: string;
    path: string;
    /** An entry that runs an action instead of navigating (`path` is then empty). */
    action?: "open-ask-dev";
};

/**
 * The destinations the palette can open: every area row and every child the sidebar would list
 * (`isNavChildVisible`: shown in the menu, the organization has its feature, and a platform admin
 * row only for a platform admin).
 * Registry order, labels as the sidebar writes them. After a destination come its tabs, from the tab
 * registry (`lib/navigation/tabs.ts`). Nothing here is invented: no actions, no entry for a hidden or
 * preview route, no tab of a destination the sidebar would not list, no tab whose feature the
 * organization lacks.
 */
export function paletteEntries(
    areas: readonly NavArea[],
    features: Record<string, boolean>,
    tabSets: readonly TabSet[] = TAB_SETS,
    viewer: NavViewer = {},
): PaletteEntry[] {
    const entries: PaletteEntry[] = [];
    const seen = new Set<string>();
    const add = (id: string, label: string, areaLabel: string, path: string) => {
        const key = `${path}|${label}`;
        if (seen.has(key)) return;
        seen.add(key);
        entries.push({ id, label, areaLabel, path });
    };
    for (const area of areas) {
        // An area the sidebar does not list is not offered (CHAOS-12210: Ask Dev).
        if (!isNavAreaVisible(area, features)) continue;
        add(`area-${area.id}`, area.paletteLabel ?? area.label, area.label, area.href);
        for (const child of area.children) {
            if (!isNavChildVisible(child, features, viewer)) continue;
            add(`${area.id}-${child.id}`, child.label, area.label, child.path);
            // The destination's tabs follow it (the default tab is the destination row itself).
            for (const set of tabSets) {
                if (set.areaId !== area.id || (set.childPath ?? set.basePath) !== child.path)
                    continue;
                for (const tab of set.tabs) {
                    // A tab that needs a feature the organization lacks is not offered (Admin).
                    if (!isTabVisible(tab, features)) continue;
                    const href = tabHref(set, tab.id);
                    // The tab that is the destination row itself is not listed twice.
                    if (href === child.path) continue;
                    add(
                        `${area.id}-${child.id}-${tab.id}`,
                        tab.label,
                        `${child.label} · ${area.label}`,
                        href,
                    );
                }
            }
        }
    }
    return entries;
}

/** Case-insensitive; every word of the query must appear in the label or the area label. */
export function filterPaletteEntries(entries: PaletteEntry[], query: string): PaletteEntry[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return entries;
    return entries.filter((entry) => {
        const haystack = `${entry.label} ${entry.areaLabel}`.toLowerCase();
        return words.every((word) => haystack.includes(word));
    });
}

/** The Ask Dev entry: offered only where the launcher and the shortcut are (the same gate). */
export const ASK_DEV_PALETTE_ENTRY: PaletteEntry = {
    id: "action-open-ask-dev",
    label: "Ask Dev",
    areaLabel: "Open the Ask Dev panel",
    path: "",
    action: "open-ask-dev",
};
