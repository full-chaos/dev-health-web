import { CTA_LABELS } from "@/lib/design/cta";
import { PrerequisiteCallout } from "./PrerequisiteCallout";

type StepNavProps = {
    onBackAction?: () => void;
    onContinueAction: () => void;
    blockReason: string | null;
};

/** Back/Continue footer for a non-review wizard step (CHAOS-2838). */
export function StepNav({ onBackAction, onContinueAction, blockReason }: StepNavProps) {
    return (
        <div className="space-y-3">
            {blockReason ? (
                <PrerequisiteCallout title="Before you continue" description={blockReason} />
            ) : null}
            <div className="flex items-center justify-between gap-3">
                {onBackAction ? (
                    <button
                        type="button"
                        onClick={onBackAction}
                        className="rounded-lg border border-(--card-stroke) px-4 py-2 text-sm font-medium text-(--ink-muted) hover:bg-(--card-70) hover:text-foreground"
                    >
                        {CTA_LABELS.backButton}
                    </button>
                ) : (
                    <span />
                )}
                <button
                    type="button"
                    onClick={onContinueAction}
                    disabled={!!blockReason}
                    className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {CTA_LABELS.continueStep}
                </button>
            </div>
        </div>
    );
}
