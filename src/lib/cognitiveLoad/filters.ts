import type { MetricFilter } from "@/lib/filters/types";

/**
 * Derive the single repo filter value for the /cognitive-load surface (CHAOS-2386).
 *
 * The "Repo" picker is the always-visible `GlobalContextBarClient` control
 * (rendered via `ContextStrip` on every page), independent of the page-level
 * `filters.scope` selector — which on this surface is locked to "team" for
 * the no-surveillance contract. Selecting a repo there writes to
 * `filters.what.repos`, mirroring how `complexityScopeInputFromFilter`
 * (`@/lib/complexity/filters`) falls back to `filters.what.repos`.
 *
 * The cognitive-load resolver accepts a single `repoId` (mirroring its
 * existing singular `teamId` filter), so we take the first selected repo
 * when present rather than an array.
 */
export function cognitiveLoadRepoIdFromFilter(filters: MetricFilter): string | null {
    return filters.what.repos && filters.what.repos.length > 0 ? filters.what.repos[0] : null;
}
