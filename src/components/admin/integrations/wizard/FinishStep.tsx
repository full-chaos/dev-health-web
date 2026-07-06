import Link from "next/link";
import { CTA_LABELS } from "@/lib/design/cta";
import { ReviewSummary, type ReviewSummaryRow } from "@/components/shared/ReviewSummary";

type FinishStepProps = {
    providerLabel: string;
    credentialName: string;
    authMethodLabel: string;
    isRedirect: boolean;
    isPending: boolean;
    submitted: boolean;
    onBackAction: () => void;
    onFinishAction: () => void;
    onDoneAction: () => void;
};

/**
 * Final review step of the Add Provider wizard (CHAOS-2837 AC3): a read-only
 * summary of the staged credential, then "Finish" persists it. On success it
 * flips to a confirmation state offering the wizard's declared next step —
 * creating a sync configuration — rather than silently closing.
 */
export function FinishStep({
    providerLabel,
    credentialName,
    authMethodLabel,
    isRedirect,
    isPending,
    submitted,
    onBackAction,
    onFinishAction,
    onDoneAction,
}: FinishStepProps) {
    const rows: ReviewSummaryRow[] = [
        { label: "Provider", value: providerLabel },
        { label: "Auth method", value: authMethodLabel },
        { label: "Credential name", value: credentialName || "default" },
    ];

    if (submitted) {
        return (
            <div className="space-y-4">
                <ReviewSummary rows={rows} />
                <p role="status" className="text-sm text-(--positive)">
                    {providerLabel} credential saved.
                </p>
                <div className="flex items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={onDoneAction}
                        className="rounded-lg border border-(--card-stroke) px-4 py-2 text-sm font-medium text-(--ink-muted) hover:bg-(--card-70) hover:text-foreground"
                    >
                        {CTA_LABELS.done}
                    </button>
                    <Link
                        href="/org/admin/sync/new"
                        className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90"
                    >
                        {CTA_LABELS.createSyncConfig}
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <ReviewSummary rows={rows} />
            <div className="flex items-center justify-between gap-3">
                <button
                    type="button"
                    onClick={onBackAction}
                    className="rounded-lg border border-(--card-stroke) px-4 py-2 text-sm font-medium text-(--ink-muted) hover:bg-(--card-70) hover:text-foreground"
                >
                    {CTA_LABELS.backButton}
                </button>
                {!isRedirect && (
                    <button
                        type="button"
                        onClick={onFinishAction}
                        disabled={isPending}
                        className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90 disabled:opacity-50"
                    >
                        {isPending ? CTA_LABELS.savingConfiguration : CTA_LABELS.finishAddProvider}
                    </button>
                )}
            </div>
        </div>
    );
}
