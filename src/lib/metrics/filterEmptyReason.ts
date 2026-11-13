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
};

export const FILTER_EMPTY_REASON_NEUTRAL_TEXT = "The selected filter matched nothing.";

export function filterEmptyReasonText(reason: string | null | undefined): string | null {
    if (!reason) return null;
    return Object.prototype.hasOwnProperty.call(FILTER_EMPTY_REASON_TEXT, reason)
        ? FILTER_EMPTY_REASON_TEXT[reason]
        : FILTER_EMPTY_REASON_NEUTRAL_TEXT;
}
