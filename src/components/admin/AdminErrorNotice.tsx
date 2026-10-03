"use client";

import { Button } from "@/components/shared/Button";
import { Notice } from "@/components/ui/Notice";
import { isValidationStatus } from "@/lib/actionFailure";
import { CTA_LABELS } from "@/lib/design/cta";

/**
 * The page-level error of a client admin list page.
 * - A plan-gate answer ("This feature requires the … plan …") is not an error: a warn notice with
 *   the served sentence.
 * - A LOAD failure: one plain sentence + Retry; the backend text is the caller's to log.
 * - An ACTION failure (save, toggle, delete): the served message in a danger notice ONLY for a
 *   validation answer (a 4xx other than 401/403, with a message the admin must act on, for example a
 *   bad CIDR). A 5xx, a network failure or an unknown status is one plain sentence; the served text
 *   is the caller's to log.
 */
export type AdminErrorNoticeProps = {
    error: string;
    kind: "load" | "action";
    /** HTTP status of the failed action, when known. Only a validation status shows the served text. */
    status?: number;
    /** The served text is an action-level answer to act on (an HTTP 200 with an embedded failure). */
    served?: boolean;
    /** What failed to load, for the load sentence ("IP allowlist entries"). */
    subject: string;
    onRetryAction: () => void;
};

const PLAN_GATE = /^This feature requires the /u;

export { isValidationStatus };

export function AdminErrorNotice({
    error,
    kind,
    status,
    served = false,
    subject,
    onRetryAction,
}: AdminErrorNoticeProps) {
    if (PLAN_GATE.test(error)) {
        return (
            <Notice variant="warn" live={false}>
                {error}
            </Notice>
        );
    }
    if (kind === "load") {
        return (
            <Notice
                variant="danger"
                live={false}
                action={<Button onClick={onRetryAction}>{CTA_LABELS.retry}</Button>}
            >
                {subject} could not be loaded. Retry, or check again in a moment.
            </Notice>
        );
    }
    if (served || isValidationStatus(status)) {
        return (
            <Notice variant="danger" live={false}>
                {error}
            </Notice>
        );
    }
    return (
        <Notice variant="danger" live={false}>
            That change could not be completed. Try again in a moment.
        </Notice>
    );
}
