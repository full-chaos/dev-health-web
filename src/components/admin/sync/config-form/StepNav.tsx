import Link from "next/link";

import { Button, buttonClassName } from "@/components/shared/Button";
import { CTA_LABELS } from "@/lib/design/cta";
import { PrerequisiteCallout } from "./PrerequisiteCallout";

type StepNavProps = {
    onBackAction?: () => void;
    onContinueAction: () => void;
    blockReason: string | null;
    /** Where Cancel goes; the footer shows a Cancel next to Continue when it is given. */
    cancelHref?: string;
};

/** Back/Continue footer for a non-review wizard step (CHAOS-2838). */
export function StepNav({ onBackAction, onContinueAction, blockReason, cancelHref }: StepNavProps) {
    return (
        <div className="space-y-3">
            {blockReason ? (
                <PrerequisiteCallout title="Before you continue" description={blockReason} />
            ) : null}
            <div className="flex items-center justify-between gap-3">
                {onBackAction ? (
                    <Button onClick={onBackAction}>{CTA_LABELS.backButton}</Button>
                ) : (
                    <span />
                )}
                <div className="flex items-center gap-2">
                    {cancelHref ? (
                        <Link href={cancelHref} className={buttonClassName("secondary")}>
                            {CTA_LABELS.cancel}
                        </Link>
                    ) : null}
                    <Button variant="primary" onClick={onContinueAction} disabled={!!blockReason}>
                        {CTA_LABELS.continueStep}
                    </Button>
                </div>
            </div>
        </div>
    );
}
