import { DataState } from "@/components/ui/DataState";
import { READ_FAILED_MESSAGE } from "@/lib/readFailure";

/** The one sentence under the failed-read title (the area cards' wording, CHAOS-8168). */
export const READ_FAILED_DETAIL =
    "The data for this view could not be read. Try again in a moment.";

type ReadFailedStateProps = {
    className?: string;
    /** Smaller box for use inside a card. */
    compact?: boolean;
    /** Level of the title heading; default 2. */
    headingLevel?: 2 | 3 | 4 | 5 | 6;
    "data-testid"?: string;
};

/**
 * The failed-read state of a panel: the read FAILED (an error or a timeout). It is never an empty
 * window ("No data") and never "no findings": those states need an ANSWER. One wording for every
 * surface; the backend text is in the server log only.
 */
export function ReadFailedState({
    className,
    compact,
    headingLevel,
    "data-testid": testId,
}: ReadFailedStateProps) {
    return (
        <DataState
            variant="error"
            title={READ_FAILED_MESSAGE}
            message={READ_FAILED_DETAIL}
            className={className}
            compact={compact}
            headingLevel={headingLevel}
            data-testid={testId ?? "read-failed-state"}
        />
    );
}
