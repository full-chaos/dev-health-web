"use client";

import { Button } from "@/components/shared/Button";
import { Notice } from "@/components/ui/Notice";
import { CTA_LABELS } from "@/lib/design/cta";

/**
 * The page-level error of a client admin list page.
 * - A plan-gate answer ("This feature requires the … plan …") is not an error: a warn notice with
 *   the served sentence.
 * - A LOAD failure: one plain sentence + Retry; the backend text is the caller's to log.
 * - An ACTION failure (save, toggle, delete): the served message in a danger notice; it is feedback
 *   the admin must read (for example a validation text).
 */
export type AdminErrorNoticeProps = {
    error: string;
    kind: "load" | "action";
    /** What failed to load, for the load sentence ("IP allowlist entries"). */
    subject: string;
    onRetryAction: () => void;
};

const PLAN_GATE = /^This feature requires the /u;

export function AdminErrorNotice({ error, kind, subject, onRetryAction }: AdminErrorNoticeProps) {
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
    return (
        <Notice variant="danger" live={false}>
            {error}
        </Notice>
    );
}
