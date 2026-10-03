import type { BreakdownItem, BreakdownResult } from "@/lib/graphql/schemas/analytics";
import { resolveEntityLabels } from "@/lib/labels/entityLabel";

/** One repository row of the served line-coverage breakdown (REPO dimension). */
export type RepositoryCoverageRow = {
    /** The served breakdown key (repository id). */
    id: string;
    /** Render-safe name: the server-resolved display name, else a stable short label (A7). */
    name: string;
    /** Full identifier for a tooltip. */
    title: string;
    /** Served line coverage of the repository, in percent. */
    lineCoverage: number;
};

/**
 * The repository rows of the Coverage tab, in the served order. The names use the same rule the
 * old repository bar chart used (`resolveEntityLabels` with the server label first; an unresolved
 * id reads "Unresolved", never a bare UUID). Values are the served ones; nothing is computed.
 */
export function buildRepositoryCoverage(
    breakdown: BreakdownResult | undefined,
): RepositoryCoverageRow[] {
    const items: BreakdownItem[] = breakdown?.items ?? [];
    const { labels, titles } = resolveEntityLabels(
        items.map((item) => item.key),
        (_id, i) => ({
            name: items[i]?.label ?? undefined,
            unresolvedFallback: "Unresolved",
        }),
    );
    return items.map((item, i) => ({
        id: item.key,
        name: labels[i],
        title: titles[i],
        lineCoverage: item.value,
    }));
}
