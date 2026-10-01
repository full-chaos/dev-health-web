import Link from "next/link";

import type { AllocationEntityKind, SelectedPathNumbers } from "@/lib/allocationSelection";
import { CTA_LABELS } from "@/lib/design/cta";
import { formatNumber } from "@/lib/formatters";

const KIND_LABEL: Record<AllocationEntityKind, string> = {
    team: "Team",
    theme: "Theme",
    subcategory: "Subcategory",
    repo: "Repo",
};

type SelectedPathPanelProps = {
    selection: { kind: AllocationEntityKind; label: string } | null;
    numbers: SelectedPathNumbers | null;
    unit: string;
    /** What the share is measured against, e.g. "all allocation" or "the drilled theme". */
    shareBase: string;
    /** Set when no honest share exists (e.g. a theme drill holds only that theme). */
    shareUnavailableReason?: string;
    /** False for a view that has no baseline flow at all. */
    hasBaseline: boolean;
    /** Href of the Evidence tab; carries the page's filters. */
    evidenceHref: string;
};

const pct = (value: number) => `${formatNumber(value, { maximumFractionDigits: 1 })}%`;

function Fact({ label, value, testId }: { label: string; value: string; testId: string }) {
    return (
        <div className="flex items-baseline justify-between gap-3 border-b border-(--card-stroke) py-2 text-sm">
            <dt className="text-(--ink-muted)">{label}</dt>
            <dd className="text-right font-medium tabular-nums" data-testid={testId}>
                {value}
            </dd>
        </div>
    );
}

/**
 * Side view of the current selection: the numbers of whatever the chart is filtered to.
 * It holds no selection of its own and computes nothing the chart's tooltip does not.
 */
export function SelectedPathPanel({
    selection,
    numbers,
    unit,
    shareBase,
    shareUnavailableReason,
    hasBaseline,
    evidenceHref,
}: SelectedPathPanelProps) {
    return (
        <aside
            className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4"
            aria-label="Selected path"
            data-testid="selected-path-panel"
        >
            <p className="text-xs uppercase tracking-[0.18em] text-(--ink-muted)">Selected path</p>
            {!selection || !numbers ? (
                <p className="mt-3 text-sm text-(--ink-muted)" data-testid="selected-path-empty">
                    Select a team, theme, subcategory or repository to inspect its path.
                </p>
            ) : (
                <>
                    <h4 className="mt-2 text-base font-medium" data-testid="selected-path-title">
                        {selection.label}
                    </h4>
                    <p className="text-xs text-(--ink-muted)">{KIND_LABEL[selection.kind]}</p>
                    <dl className="mt-3">
                        <Fact
                            label="Allocated"
                            value={`${formatNumber(numbers.allocated, { maximumFractionDigits: 1 })} ${unit}`}
                            testId="selected-path-allocated"
                        />
                        <Fact
                            label={`Share of ${shareBase}`}
                            value={
                                shareUnavailableReason
                                    ? "not shown"
                                    : numbers.share === null
                                      ? "not available"
                                      : pct(numbers.share)
                            }
                            testId="selected-path-share"
                        />
                        <Fact
                            label="Baseline share"
                            value={
                                !hasBaseline
                                    ? "not available for this view"
                                    : shareUnavailableReason || numbers.baselineShare === null
                                      ? "not available"
                                      : pct(numbers.baselineShare)
                            }
                            testId="selected-path-baseline"
                        />
                        <Fact
                            label="Change"
                            value={
                                numbers.changePp === null || shareUnavailableReason
                                    ? "not available"
                                    : `${numbers.changePp > 0 ? "+" : ""}${formatNumber(numbers.changePp, { maximumFractionDigits: 1 })} percentage points`
                            }
                            testId="selected-path-change"
                        />
                    </dl>
                    {shareUnavailableReason && (
                        <p className="mt-2 text-xs text-(--ink-muted)">{shareUnavailableReason}</p>
                    )}
                    <div className="mt-3 border-l-2 border-(--card-stroke) pl-3 text-xs leading-relaxed text-(--ink-muted)">
                        <strong className="text-(--ink)">Attribution, not dependency.</strong> This
                        path shows where effort appears to land. It does not assert downstream
                        impact or a technical dependency.
                    </div>
                    <Link
                        href={evidenceHref}
                        className="mt-3 inline-block text-xs uppercase tracking-[0.18em] text-(--accent-2) hover:underline"
                    >
                        {CTA_LABELS.openEvidence}
                    </Link>
                </>
            )}
        </aside>
    );
}
