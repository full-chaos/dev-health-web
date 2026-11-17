/**
 * Why a filter matched nothing, as served in `filterEmptyReason` (CHAOS-9098).
 * Approved wording (CHAOS-9193). An absent value has no text: the plain no-data state.
 * An unknown non-empty value draws the neutral sentence, never a repository one.
 */
export const FILTER_EMPTY_REASON_TEXT: Readonly<Record<string, string>> = {
    repository_not_in_team: "The selected repository is not owned by the selected team.",
    repository_not_found: "The selected repository was not found.",
    service_not_found: "The selected service was not found.",
    developer_not_found: "The selected developer was not found.",
    team_owns_no_repository: "No owned repositories",
};

/** The reason of a selected team that owns no repository: a state of its own, never a value (CHAOS-13854). */
export const TEAM_OWNS_NO_REPOSITORY = "team_owns_no_repository";

export const teamOwnsNoRepository = (reason: string | null | undefined): boolean =>
    reason === TEAM_OWNS_NO_REPOSITORY;

/**
 * The one reason of a page whose parts read separate answers (CHAOS-13936): "no owned repositories"
 * when any answer carries it, else the first reason served. Never derived: it only picks among
 * served reasons, so every tile, notice and trend of the page agrees.
 */
export const pageEmptyReason = (
    ...reasons: ReadonlyArray<string | null | undefined>
): string | null =>
    reasons.some(teamOwnsNoRepository)
        ? TEAM_OWNS_NO_REPOSITORY
        : (reasons.find((reason) => Boolean(reason)) ?? null);

export const FILTER_EMPTY_REASON_NEUTRAL_TEXT = "The selected filter matched nothing.";

export function filterEmptyReasonText(reason: string | null | undefined): string | null {
    if (!reason) return null;
    return Object.prototype.hasOwnProperty.call(FILTER_EMPTY_REASON_TEXT, reason)
        ? FILTER_EMPTY_REASON_TEXT[reason]
        : FILTER_EMPTY_REASON_NEUTRAL_TEXT;
}
