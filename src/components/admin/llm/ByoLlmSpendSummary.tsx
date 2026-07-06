"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { AIPanelCard } from "@/components/ai/AIPanelCard";
import { AIEmptyState } from "@/components/ai/AIEmptyState";
import { DataState } from "@/components/ui/DataState";
import { CTA_LABELS } from "@/lib/design/cta";
import type { LLMSettingsActionResult, LLMSpendSummaryResponse } from "@/lib/admin/types";

type LockState = {
    reason: "not_licensed" | "not_enabled";
    message: string;
} | null;

export type ByoLlmSpendSummaryProps = {
    loadSpendAction: () => Promise<LLMSettingsActionResult<LLMSpendSummaryResponse>>;
};

const PANEL_TITLE = "AI / LLM Spend Summary (BYO-LLM)";
const PANEL_DESCRIPTION =
    "Per-run LLM call volume, token usage, and model for the latest runs in the last 30 days.";

function formatNumber(value: number): string {
    return value.toLocaleString();
}

/**
 * Failure counts, keyed by persisted categorization-outcome class (e.g.
 * "llm_error", "low_confidence") — derived from
 * `work_unit_investments.categorization_status`. This is NOT the exact fatal
 * provider-exception taxonomy (`LLMAuthError`/`LLMRateLimitError`/etc, which
 * is only logged, never persisted) — see CHAOS-2349 plan §7 C4.
 */
function FailureBadges({ failuresByClass }: { failuresByClass: Record<string, number> }) {
    const entries = Object.entries(failuresByClass).filter(([, count]) => count > 0);
    if (entries.length === 0) {
        return <span className="text-xs text-(--ink-muted)">None</span>;
    }
    return (
        <div className="flex flex-wrap gap-1">
            {entries.map(([className, count]) => (
                <span
                    key={className}
                    className="inline-flex items-center rounded-full bg-(--card-70) px-2 py-0.5 text-xs text-(--ink-muted)"
                    title={`${className}: ${count} (categorization-outcome class, not an exact provider-exception count)`}
                >
                    {className} ×{count}
                </span>
            ))}
        </div>
    );
}

/**
 * Org-scoped "AI / LLM Spend Summary (BYO-LLM)" admin panel (CHAOS-2564).
 * Consumes `GET /admin/llm-settings/spend` via the injected server action,
 * following the same locked-state pattern as {@link ByoLlmSettings} so a
 * tier/flag gate (402/403) renders as an explicit upsell rather than a
 * generic load error. Rows with no `run_id` (spend recorded before per-run
 * tracking began) are never folded into the per-run table — they surface as
 * a distinct legacy state (`legacy` rows), per plan §6.3 / §7 C4.
 */
export function ByoLlmSpendSummary({ loadSpendAction }: ByoLlmSpendSummaryProps) {
    const [loading, setLoading] = useState(true);
    const [locked, setLocked] = useState<LockState>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [summary, setSummary] = useState<LLMSpendSummaryResponse | null>(null);

    const fetchSpend = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        setLocked(null);
        const result = await loadSpendAction();
        if (result.status === 402) {
            setLocked({
                reason: "not_licensed",
                message: result.error ?? "BYO-LLM spend summary requires Team tier or higher.",
            });
        } else if (result.status === 403) {
            setLocked({
                reason: "not_enabled",
                message: result.error ?? "BYO-LLM is not enabled for this organization.",
            });
        } else if (result.error) {
            setLoadError(result.error);
        } else if (result.data) {
            setSummary(result.data);
        }
        setLoading(false);
    }, [loadSpendAction]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchSpend coordinates async loading state after mount.
        fetchSpend();
    }, [fetchSpend]);

    let body: ReactNode;

    if (loading) {
        body = <DataState variant="loading" title="Loading spend summary…" />;
    } else if (locked) {
        body = (
            <div
                className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-6 text-center"
                data-testid="byo-llm-spend-locked"
            >
                <p className="text-xs font-semibold uppercase tracking-wider text-(--accent)">
                    {locked.reason === "not_licensed" ? "Team Plan Feature" : "Feature Disabled"}
                </p>
                <p className="mt-2 text-sm text-(--ink-muted)">{locked.message}</p>
                {locked.reason === "not_licensed" ? (
                    <Link
                        href="/org/admin/settings"
                        className="mt-4 inline-flex items-center justify-center rounded-full bg-(--accent) px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-(--accent)/90"
                    >
                        {CTA_LABELS.upgradePlan}
                    </Link>
                ) : null}
            </div>
        );
    } else if (loadError) {
        body = (
            <DataState
                variant="error"
                message={loadError}
                action={
                    <button
                        type="button"
                        onClick={fetchSpend}
                        className="rounded-lg border border-(--negative)/30 bg-(--card-80) px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-(--negative)/50"
                    >
                        {CTA_LABELS.retry}
                    </button>
                }
            />
        );
    } else if (!summary || (summary.runs.length === 0 && summary.legacy.length === 0)) {
        body = (
            <AIEmptyState title="No BYO-LLM spend recorded yet">
                Spend appears here once a run makes at least one BYO-LLM call.
            </AIEmptyState>
        );
    } else if (summary.runs.length === 0 && summary.legacy.length > 0) {
        body = (
            <DataState
                variant="detector-unavailable"
                title="Legacy spend not attributable to a run"
                description="Spend was recorded before per-run tracking began and can't be attributed to a specific run. Only spend with a known run is shown here."
                data-testid="byo-llm-spend-legacy"
            />
        );
    } else {
        body = (
            <div className="space-y-3">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-(--card-stroke) text-xs uppercase tracking-wide text-(--ink-muted)">
                                <th className="py-2 pr-4 font-medium">Run</th>
                                <th className="py-2 pr-4 font-medium">Model</th>
                                <th className="py-2 pr-4 text-right font-medium">Calls</th>
                                <th className="py-2 pr-4 text-right font-medium">Input tokens</th>
                                <th className="py-2 pr-4 text-right font-medium">Output tokens</th>
                                <th className="py-2 font-medium">Failures by class</th>
                            </tr>
                        </thead>
                        <tbody>
                            {summary.runs.map((run) => (
                                <tr
                                    key={run.run_id}
                                    className="border-b border-(--card-stroke)/60 last:border-0"
                                >
                                    <td className="py-2 pr-4 font-mono text-xs" title={run.run_id}>
                                        {run.run_id.slice(0, 8)}
                                    </td>
                                    <td className="py-2 pr-4">{run.model ?? "—"}</td>
                                    <td className="py-2 pr-4 text-right">
                                        {formatNumber(run.calls)}
                                    </td>
                                    <td className="py-2 pr-4 text-right">
                                        {formatNumber(run.input_tokens)}
                                    </td>
                                    <td className="py-2 pr-4 text-right">
                                        {formatNumber(run.output_tokens)}
                                    </td>
                                    <td className="py-2">
                                        <FailureBadges failuresByClass={run.failures_by_class} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="text-xs text-(--ink-muted)">
                    Failure classes reflect persisted categorization outcomes (from work-unit
                    categorization), not exact provider-exception counts.
                </p>
                {summary.legacy.length > 0 ? (
                    <p className="text-xs text-(--ink-muted)">
                        Additional legacy spend recorded before per-run tracking began exists for
                        this organization and is not attributable to a specific run above.
                    </p>
                ) : null}
            </div>
        );
    }

    return (
        <AIPanelCard title={PANEL_TITLE} description={PANEL_DESCRIPTION}>
            {body}
        </AIPanelCard>
    );
}
