import { RefreshCw } from "lucide-react";

import { Button } from "@/components/shared/Button";
import { CTA_LABELS } from "@/lib/design/cta";
import { formatSubcategoryLabel, readSizingCoverage, titleCase } from "@/lib/investment";
import { describeSizing } from "./AllocationCoverage";
import type { MixExplanationState } from "./types";

const DRIVER_HINTS: Record<string, string> = {
    low_text_signal: "Short descriptions lack categorization signals",
    weak_cross_links: "Few issue↔PR↔commit links detected",
    missing_evidence_metadata: "Over 30% of units have unknown quality",
    high_uncertainty_spread: "Quality varies significantly across units",
};

type InvestmentExplainerProps = {
    mixExplanation: MixExplanationState;
    mixExplainKey: string;
    isExplainingMix: boolean;
    onRegenerate: () => void;
};

/**
 * The labelled AI explanation of the investment mix, inside the "Read this with context" card
 * (collapsed there by default). The text is the served explanation; the web adds no claim.
 */
export function InvestmentExplainer({
    mixExplanation,
    mixExplainKey,
    isExplainingMix,
    onRegenerate,
}: InvestmentExplainerProps) {
    return (
        <div className="min-w-0" data-testid="investment-explainer">
            <span
                className="inline-block whitespace-nowrap rounded-sm bg-(--surface2) px-1.75 py-0.75 text-xs font-semibold text-(--ink-muted)"
                data-testid="ai-generated-label"
            >
                AI-generated
            </span>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-(--ink-muted)">
                    {mixExplanation.focus.subcategory
                        ? `Focused: ${formatSubcategoryLabel(mixExplanation.focus.subcategory, true)}`
                        : mixExplanation.focus.theme
                          ? `Focused: ${titleCase(mixExplanation.focus.theme)}`
                          : "Focused: All themes"}
                </div>
                {(!mixExplanation.data || mixExplanation.data.status !== "llm_unavailable") && (
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={<RefreshCw />}
                        onClick={onRegenerate}
                        disabled={isExplainingMix}
                    >
                        {isExplainingMix ? CTA_LABELS.generating : CTA_LABELS.regenerate}
                    </Button>
                )}
            </div>
            <div className="mt-4 min-w-0 space-y-4">
                {mixExplanation.data?.status === "llm_unavailable" ? (
                    <p className="text-sm text-(--ink-muted)">
                        Investment distribution uses metadata-based categorization. Connect an LLM
                        provider in settings to enable AI-generated explanations.
                    </p>
                ) : !mixExplanation.data || mixExplanation.filtersKey !== mixExplainKey ? (
                    <p className="text-sm text-(--ink-muted)">
                        {mixExplanation.filtersKey === mixExplainKey
                            ? "Explanation unavailable for this window."
                            : "Generating investment explanation..."}
                    </p>
                ) : (
                    <>
                        <p className="wrap-anywhere text-sm text-foreground">
                            {mixExplanation.data.summary}
                        </p>

                        {(mixExplanation.data.top_findings?.length ?? 0) > 0 && (
                            <div className="space-y-2">
                                <p className="text-label-caps uppercase text-(--ink-muted)">
                                    Findings
                                </p>
                                <ul className="space-y-2" data-testid="explainer-findings">
                                    {mixExplanation.data.top_findings.slice(0, 3).map((finding) => (
                                        <li
                                            key={`${finding.finding}-${finding.evidence.theme}-${finding.evidence.share_pct}`}
                                            className="min-w-0 rounded-lg border border-(--card-stroke) bg-background/50 p-3"
                                        >
                                            <p className="wrap-anywhere text-sm">
                                                {finding.finding}
                                            </p>
                                            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-xs text-(--ink-muted)">
                                                <span className="wrap-anywhere rounded-full bg-(--card-stroke)/50 px-2 py-0.5">
                                                    {finding.evidence.subcategory
                                                        ? formatSubcategoryLabel(
                                                              finding.evidence.subcategory,
                                                              false,
                                                          )
                                                        : titleCase(finding.evidence.theme)}
                                                </span>
                                                {finding.evidence.subcategory && (
                                                    <span className="wrap-anywhere opacity-70">
                                                        {titleCase(finding.evidence.theme)}
                                                    </span>
                                                )}
                                                <span>
                                                    {Math.round(finding.evidence.share_pct)}%
                                                </span>
                                                {finding.evidence.measure === "ISSUE_SIZE" && (
                                                    <span
                                                        data-testid="finding-sizing"
                                                        className="wrap-anywhere opacity-70"
                                                    >
                                                        {
                                                            describeSizing(
                                                                readSizingCoverage(
                                                                    finding.evidence
                                                                        .sizing_coverage,
                                                                    finding.evidence
                                                                        .unsized_unit_count,
                                                                ),
                                                            ).note
                                                        }
                                                    </span>
                                                )}
                                                {finding.evidence.evidence_quality_band && (
                                                    <span className="wrap-anywhere opacity-70">
                                                        Quality:{" "}
                                                        {finding.evidence.evidence_quality_band}
                                                    </span>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {(mixExplanation.data.confidence?.drivers?.length ?? 0) > 0 && (
                            <div className="space-y-2">
                                <p className="text-label-caps uppercase text-(--ink-muted)">
                                    Quality drivers
                                </p>
                                <div className="flex flex-wrap gap-1">
                                    {(mixExplanation.data.confidence?.drivers ?? []).map(
                                        (driver) => (
                                            <span
                                                key={driver}
                                                className="wrap-anywhere rounded-full bg-(--card-stroke)/50 px-2 py-0.5 text-xs text-(--ink-muted)"
                                                title={DRIVER_HINTS[driver] ?? driver}
                                            >
                                                {driver.replace(/_/g, " ")}
                                            </span>
                                        ),
                                    )}
                                </div>
                            </div>
                        )}

                        {(mixExplanation.data.what_to_check_next?.length ?? 0) > 0 && (
                            <div className="space-y-2">
                                <p className="text-label-caps uppercase text-(--ink-muted)">
                                    What to check next
                                </p>
                                <ul className="space-y-2">
                                    {mixExplanation.data.what_to_check_next
                                        .slice(0, 3)
                                        .map((action) => (
                                            <li
                                                key={`${action.action}-${action.where}`}
                                                className="wrap-anywhere text-sm"
                                            >
                                                <span className="font-medium">{action.action}</span>
                                                <span className="text-(--ink-muted)">
                                                    {" "}
                                                    - {action.why}
                                                </span>
                                            </li>
                                        ))}
                                </ul>
                            </div>
                        )}

                        {(mixExplanation.data.anti_claims?.length ?? 0) > 0 && (
                            <details className="text-xs text-(--ink-muted)">
                                <summary className="cursor-pointer">What this does NOT say</summary>
                                <ul className="mt-2 list-disc space-y-1 pl-5">
                                    {mixExplanation.data.anti_claims.map((claim) => (
                                        <li key={claim}>{claim}</li>
                                    ))}
                                </ul>
                            </details>
                        )}

                        {mixExplanation.data.status && mixExplanation.data.status !== "valid" && (
                            <p className="text-xs italic text-(--ink-muted)">
                                Fallback explanation shown ({mixExplanation.data.status})
                            </p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
