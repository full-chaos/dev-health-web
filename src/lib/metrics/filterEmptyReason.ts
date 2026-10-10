/**
 * Why a repository filter matched nothing, as served in `filterEmptyReason` (CHAOS-9098).
 * Approved wording (CHAOS-9193). An unknown or absent value has no text: the plain no-data state.
 */
export const FILTER_EMPTY_REASON_TEXT: Readonly<Record<string, string>> = {
    repository_not_in_team: "The selected repository is not owned by the selected team.",
    repository_not_found: "The selected repository was not found.",
};

export function filterEmptyReasonText(reason: string | null | undefined): string | null {
    if (!reason) return null;
    return Object.prototype.hasOwnProperty.call(FILTER_EMPTY_REASON_TEXT, reason)
        ? FILTER_EMPTY_REASON_TEXT[reason]
        : null;
}
