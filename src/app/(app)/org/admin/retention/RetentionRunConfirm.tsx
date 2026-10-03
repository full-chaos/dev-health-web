"use client";

import { logger } from "@/lib/logger";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ReviewSummary, type ReviewSummaryRow } from "@/components/shared/ReviewSummary";
import { CTA_LABELS } from "@/lib/design/cta";
import type { ActionResult } from "@/lib/result";
import type { RetentionExecuteResponse, RetentionPolicy } from "@/lib/admin/types";

type RetentionRunConfirmProps = {
    /** The policy pending a manual run, or `null` to keep this dialog closed. */
    policy: RetentionPolicy | null;
    onDryRunAction: (id: string) => Promise<ActionResult<RetentionExecuteResponse>>;
    onExecuteAction: (id: string) => Promise<ActionResult<RetentionExecuteResponse>>;
    onCloseAction: () => void;
};

/**
 * Manual-run flow for a single retention policy (CHAOS-2842): fetches a real
 * backend dry-run count first (`executeRetentionPolicy(id, true)` — a genuine
 * server-side preview, not a client estimate) and renders it as a
 * {@link ReviewSummary}, then requires an explicit {@link ConfirmDialog}
 * confirmation before the destructive, non-dry-run execution actually
 * deletes records.
 */
/** The one sentence shown when a retention run reports a failure inside an HTTP 200 body. */
export const RETENTION_RUN_FAILED_MESSAGE = "The retention run did not complete. Try again.";

export function RetentionRunConfirm({
    policy,
    onDryRunAction,
    onExecuteAction,
    onCloseAction,
}: RetentionRunConfirmProps) {
    const [dryRunResult, setDryRunResult] = useState<RetentionExecuteResponse | null>(null);
    const [dryRunError, setDryRunError] = useState<string | null>(null);
    const [isPending, setIsPending] = useState(policy !== null);
    const [trackedPolicyId, setTrackedPolicyId] = useState<string | null>(policy?.id ?? null);

    const targetId = policy?.id ?? null;
    if (targetId !== trackedPolicyId) {
        // Reset the stale dry-run result when the targeted policy changes —
        // adjusting state during render (React's documented pattern) since
        // this derives state from a prop change, not from synchronizing
        // with an external system.
        setTrackedPolicyId(targetId);
        setDryRunResult(null);
        setDryRunError(null);
        setIsPending(targetId !== null);
    }

    useEffect(() => {
        if (!policy) return;
        const targetPolicyId = policy.id;
        let active = true;

        async function runDryRun() {
            const result = await onDryRunAction(targetPolicyId);
            if (!active) return;
            setIsPending(false);

            if (result.error) {
                setDryRunError(result.error);
                return;
            }
            if (!result.data) {
                setDryRunError("Dry run failed: the backend returned no response data.");
                return;
            }
            if (result.data.error) {
                // A 200 body with an embedded error: a database or worker message. Never printed.
                logger.error(
                    { err: result.data.error, policyId: targetPolicyId },
                    "Retention dry run failed",
                );
                setDryRunError(RETENTION_RUN_FAILED_MESSAGE);
                return;
            }
            setDryRunResult(result.data);
        }
        runDryRun();

        return () => {
            active = false;
        };
        // Re-run only when the target policy's identity changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [policy?.id]);

    if (!policy) return null;

    const rows: ReviewSummaryRow[] = [
        { label: "Resource type", value: policy.resource_type },
        { label: "Retention period", value: `${policy.retention_days} days` },
        {
            label: "Records matched by this run",
            value: dryRunResult ? dryRunResult.deleted_count.toLocaleString() : "Checking...",
        },
    ];

    const warnings = dryRunResult
        ? [
              `${dryRunResult.deleted_count.toLocaleString()} ${policy.resource_type} record(s) older than ${policy.retention_days} days will be permanently deleted. This cannot be undone.`,
          ]
        : [];

    return (
        <ConfirmDialog
            isOpen
            title="Run retention policy now?"
            tone="destructive"
            description={
                dryRunError ? (
                    <p className="text-(--negative)">{dryRunError}</p>
                ) : (
                    <ReviewSummary rows={rows} warnings={warnings} />
                )
            }
            confirmLabel={CTA_LABELS.runPolicyNow}
            isPending={isPending || dryRunResult === null}
            onConfirmAction={() => {
                setIsPending(true);
                onExecuteAction(policy.id).finally(() => {
                    setIsPending(false);
                    onCloseAction();
                });
            }}
            onCancelAction={onCloseAction}
        />
    );
}
