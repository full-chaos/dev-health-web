import { integerFormatter } from "@/lib/formatters";
import type { MetricDelta } from "@/lib/types";

/** The metrics a repository filter scopes through linked issues (CHAOS-9120). */
export const REPO_LINK_METRICS: ReadonlySet<string> = new Set([
    "cycle_time",
    "throughput",
    "wip_saturation",
    "blocked_work",
]);

export type RepoLinkFacts = Pick<
    MetricDelta,
    "repo_link_state" | "repo_link_basis" | "repo_link_multi_repo_items" | "repo_link_coverage"
>;

const n = (value: number): string => integerFormatter.format(value);

const count = (value: number | null | undefined): number | null =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

/**
 * A state that serves no value (CHAOS-9094: has_data false, value 0). A row that arrives with one
 * of these states is drawn as no data even if its has_data says otherwise: never the value.
 */
export const isRepoLinkNoValueState = (state: string | null | undefined): boolean =>
    state === "no_links" || state === "timed_out" || state === "too_large";

/** Text 2: the state "no_links". */
export const REPO_LINK_NO_LINKS =
    "No issue is linked to this repository's pull requests in this window.";
/** Text 3: the state "timed_out". */
export const REPO_LINK_TIMED_OUT = "This read took too long. No value is shown.";
/** Text 5: the state "too_large" (the read returned more rows than its bound). */
export const REPO_LINK_TOO_LARGE =
    "Too many linked issues to read for this window. No value is shown.";

/**
 * The per-tile text of a repository-scoped work-item metric: the tier mix for "linked" (all three
 * tiers named, a tier with 0 items keeps its 0), the state text for a state without a value. An
 * unknown state, a missing count, or a metric outside the four draws nothing.
 */
export function repoLinkTileNote(
    row: (RepoLinkFacts & { metric?: string }) | null | undefined,
): string | null {
    if (!row || (row.metric !== undefined && !REPO_LINK_METRICS.has(row.metric))) return null;
    switch (row.repo_link_state) {
        case "linked": {
            const native = count(row.repo_link_basis?.native);
            const text = count(row.repo_link_basis?.explicit_text);
            const heuristic = count(row.repo_link_basis?.heuristic);
            if (native === null || text === null || heuristic === null) return null;
            return `From issues linked to this repository's pull requests: ${n(native)} native, ${n(text)} by text, ${n(heuristic)} by heuristic.`;
        }
        case "no_links":
            return REPO_LINK_NO_LINKS;
        case "timed_out":
            return REPO_LINK_TIMED_OUT;
        case "too_large":
            return REPO_LINK_TOO_LARGE;
        default:
            return null;
    }
}

/** Text 4: items also linked to pull requests of other repositories (only above 0). */
export function repoLinkMultiRepoNote(row: RepoLinkFacts | null | undefined): string | null {
    const items = count(row?.repo_link_multi_repo_items);
    if (items === null || items <= 0) return null;
    return `${n(items)} of these issues are also linked to pull requests of other repositories. Repository views do not add up to the organization total.`;
}

/** Text 6: the organization's link coverage (none when the window holds no issue). */
export function repoLinkCoverageNote(row: RepoLinkFacts | null | undefined): string | null {
    const linked = count(row?.repo_link_coverage?.linked_items);
    const total = count(row?.repo_link_coverage?.items_in_window);
    if (linked === null || total === null || total <= 0) return null;
    return `${n(linked)} of ${n(total)} issues in this window have a linked pull request.`;
}

/** The once-per-page notes (texts 4 and 6), read from the first linked row of the four metrics. */
export function repoLinkPageNotes(
    rows: readonly (RepoLinkFacts & { metric?: string })[] | null | undefined,
): string[] {
    const row = rows?.find(
        (r) =>
            r.repo_link_state === "linked" &&
            (r.metric === undefined || REPO_LINK_METRICS.has(r.metric)),
    );
    return [repoLinkMultiRepoNote(row), repoLinkCoverageNote(row)].filter(
        (t): t is string => t !== null,
    );
}

/** A tile caption with the per-tile text appended ("<caption> · <text>"). */
export function withRepoLinkNote(
    caption: string | undefined,
    row: (RepoLinkFacts & { metric?: string }) | null | undefined,
): string | undefined {
    const note = repoLinkTileNote(row);
    return note ? [caption, note].filter(Boolean).join(" · ") : caption;
}
