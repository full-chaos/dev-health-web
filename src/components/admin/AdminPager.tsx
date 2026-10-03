"use client";

import { Button } from "@/components/shared/Button";
import { CTA_LABELS } from "@/lib/design/cta";

/**
 * The admin list pager (design A5 / A6 / A7): Previous, the served range, Next, as shared small
 * buttons. It shows the range of the rows the page holds ("Showing 1–50"); it never invents a
 * total. `hasNext` is the caller's rule (for example a full page came back).
 */
export type AdminPagerProps = {
    /** Zero-based offset of the first row on the page. */
    offset: number;
    /** Rows on this page. */
    count: number;
    hasNext: boolean;
    onPreviousAction: () => void;
    onNextAction: () => void;
    disabled?: boolean;
};

export function AdminPager({
    offset,
    count,
    hasNext,
    onPreviousAction,
    onNextAction,
    disabled = false,
}: AdminPagerProps) {
    return (
        <div
            data-testid="admin-pager"
            className="mt-4 flex items-center justify-between gap-4 text-xs text-(--ink-muted)"
        >
            <span>
                Showing {offset + 1}–{offset + count}
            </span>
            <div className="flex gap-2">
                <Button size="sm" onClick={onPreviousAction} disabled={disabled || offset === 0}>
                    {CTA_LABELS.previousPage}
                </Button>
                <Button size="sm" onClick={onNextAction} disabled={disabled || !hasNext}>
                    {CTA_LABELS.nextPage}
                </Button>
            </div>
        </div>
    );
}
