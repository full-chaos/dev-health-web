import { isNavChildVisible, type NavArea } from "@/lib/navigation/areas";

export type PaletteEntry = {
    /** Unique row id (also the DOM id suffix). */
    id: string;
    label: string;
    /** The area the destination belongs to (the secondary line). */
    areaLabel: string;
    path: string;
};

/**
 * The destinations the palette can open: every area row and every child the sidebar would list
 * (`isNavChildVisible`: shown in the menu and, when it needs a feature, the organization has it).
 * Registry order, labels as the sidebar writes them. Nothing here is invented: no actions, no tabs
 * (the registry holds destinations only), no entry for a hidden or preview route.
 */
export function paletteEntries(
    areas: readonly NavArea[],
    features: Record<string, boolean>,
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
        add(`area-${area.id}`, area.label, area.label, area.href);
        for (const child of area.children) {
            if (isNavChildVisible(child, features)) {
                add(`${area.id}-${child.id}`, child.label, area.label, child.path);
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
