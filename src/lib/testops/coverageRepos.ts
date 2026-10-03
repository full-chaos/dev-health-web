import type { NullableBreakdownResult } from "@/lib/graphql/schemas/analytics";
import { resolveEntityLabels } from "@/lib/labels/entityLabel";

/**
 * The topN of the branch-coverage breakdown: the largest the API accepts (ops
 * `internal/queryapi/analytics/breakdown.go`, `maxTopN`). An answer with fewer items than this is
 * complete; an answer with exactly this many items was cut.
 */
export const BRANCH_BREAKDOWN_TOP_N = 100;

/** One repository row of the served coverage breakdowns (REPO dimension). */
export type RepositoryCoverageRow = {
    /** The served breakdown key (repository id). */
    id: string;
    /** Render-safe name: the server-resolved display name, else a stable short label (A7). */
    name: string;
    /** Full identifier for a tooltip. */
    title: string;
    /** Served line coverage of the repository, in percent. Null = not reported. */
    lineCoverage: number | null;
    /**
     * Served branch coverage of the repository, in percent. Null = no value: the branch answer has
     * a null value for the repository, does not list it, or was not served. It is "not reported"
     * unless `branchOutsideList` is true.
     */
    branchCoverage: number | null;
    /**
     * True when the branch answer was cut by its topN and does not list the repository: a branch
     * figure can exist, so the row must not read "Not reported".
     */
    branchOutsideList: boolean;
};

/**
 * The repository rows of the Coverage tab: the rows of the served line-coverage breakdown, in the
 * served order. The branch value comes from the served branch-coverage breakdown, joined by the
 * repository key (the two answers are each ordered by their own measure). The names use the same
 * rule the old repository bar chart used (`resolveEntityLabels` with the server label first; an
 * unresolved id reads "Unresolved", never a bare UUID). Values are the served ones; nothing is
 * computed, and a value that is not served stays null (never 0).
 */
export function buildRepositoryCoverage(
    line: NullableBreakdownResult | undefined,
    branch?: NullableBreakdownResult,
): RepositoryCoverageRow[] {
    const items = line?.items ?? [];
    const branchByKey = new Map((branch?.items ?? []).map((item) => [item.key, item.value]));
    // A list as long as the request's topN was cut; a shorter one holds every repository.
    const branchCut = (branch?.items.length ?? 0) >= BRANCH_BREAKDOWN_TOP_N;
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
        branchCoverage: branchByKey.get(item.key) ?? null,
        branchOutsideList: branchCut && !branchByKey.has(item.key),
    }));
}
