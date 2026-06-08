import { formatNumber } from "@/lib/formatters";
import { formatSubcategoryLabel, titleCase } from "@/lib/investment";
import type { MixExplanationState } from "./types";

type InvestmentExplainerProps = {
    mixExplanation: MixExplanationState;
    mixExplainKey: string;
    isExplainingMix: boolean;
    onRegenerate: () => void;
};

export function InvestmentExplainer({
    mixExplanation,
    mixExplainKey,
    isExplainingMix,
    onRegenerate,
}: InvestmentExplainerProps) {
    return (
        <details open className="rounded-3xl border border-(--card-stroke) bg-card p-5">
            <summary className="cursor-pointer list-none font-(--font-display) text-lg">
                What this investment mix indicates
            </summary>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-(--ink-muted)">
                    {mixExplanation.focus.subcategory
                        ? `Focused: ${formatSubcategoryLabel(mixExplanation.focus.subcategory, true)}`
                        : mixExplanation.focus.theme
                          ? `Focused: ${titleCase(mixExplanation.focus.theme)}`
                          : "Focused: All themes"}
                </div>
                {(!mixExplanation.data || mixExplanation.data.status !== "llm_unavailable") && (
                    <button
                        type="button"
                        onClick={onRegenerate}
                        disabled={isExplainingMix}
                        className="rounded-full border border-(--card-stroke) px-3 py-1 text-xs uppercase tracking-[0.2em] text-(--ink-muted) disabled:opacity-50"
                    >
                        {isExplainingMix ? "Generating..." : "Regenerate explanation"}
                    </button>
                )}
            </div>
            <div className="mt-4 space-y-4">
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
                        <p className="text-sm text-foreground">{mixExplanation.data.summary}</p>

                        {(mixExplanation.data.top_findings?.length ?? 0) > 0 && (
                            <div className="space-y-2">
                                <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                    Findings
                                </p>
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                    {mixExplanation.data.top_findings.slice(0, 3).map((finding) => (
                                        <div
                                            key={`${finding.finding}-${finding.evidence.theme}-${finding.evidence.share_pct}`}
                                            className="rounded-lg border border-(--card-stroke) bg-background/50 p-3"
                                        >
                                            <p className="text-sm">{finding.finding}</p>
                                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-(--ink-muted)">
                                                <span className="rounded-full bg-(--card-stroke)/50 px-2 py-0.5">
                                                    {finding.evidence.theme}
                                                </span>
                                                <span>{finding.evidence.share_pct}%</span>
                                                {finding.evidence.evidence_quality_band && (
                                                    <span className="opacity-70">
                                                        Quality:{" "}
                                                        {finding.evidence.evidence_quality_band}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="rounded-lg border border-(--card-stroke) bg-background/30 p-3">
                            <div className="flex items-center gap-3">
                                <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                    Confidence
                                </span>
                                <span
                                    className={`rounded-full px-2 py-0.5 text-xs uppercase ${
                                        mixExplanation.data.confidence?.level === "high"
                                            ? "bg-emerald-500/20 text-emerald-600"
                                            : mixExplanation.data.confidence?.level === "moderate"
                                              ? "bg-amber-500/20 text-amber-600"
                                              : mixExplanation.data.confidence?.level === "low"
                                                ? "bg-red-500/20 text-red-600"
                                                : "bg-gray-500/20 text-gray-500"
                                    }`}
                                >
                                    {mixExplanation.data.confidence?.level ?? "unknown"}
                                </span>
                                {mixExplanation.data.confidence?.quality_mean != null && (
                                    <span className="text-xs text-(--ink-muted)">
                                        Mean:{" "}
                                        {formatNumber(
                                            mixExplanation.data.confidence.quality_mean * 100,
                                            {
                                                maximumFractionDigits: 0,
                                            },
                                        )}
                                        %
                                        {mixExplanation.data.confidence.quality_stddev != null &&
                                            ` +- ${formatNumber(
                                                mixExplanation.data.confidence.quality_stddev * 100,
                                                {
                                                    maximumFractionDigits: 0,
                                                },
                                            )}%`}
                                    </span>
                                )}
                            </div>
                            {(mixExplanation.data.confidence?.drivers?.length ?? 0) > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {(mixExplanation.data.confidence?.drivers ?? []).map(
                                        (driver) => (
                                            <span
                                                key={driver}
                                                className="rounded-full bg-(--card-stroke)/50 px-2 py-0.5 text-xs text-(--ink-muted)"
                                                title={
                                                    driver === "low_text_signal"
                                                        ? "Short descriptions lack categorization signals"
                                                        : driver === "weak_cross_links"
                                                          ? "Few issue↔PR↔commit links detected"
                                                          : driver === "missing_evidence_metadata"
                                                            ? "Over 30% of units have unknown quality"
                                                            : driver === "high_uncertainty_spread"
                                                              ? "Quality varies significantly across units"
                                                              : driver
                                                }
                                            >
                                                {driver.replace(/_/g, " ")}
                                            </span>
                                        ),
                                    )}
                                </div>
                            )}
                        </div>

                        {(mixExplanation.data.what_to_check_next?.length ?? 0) > 0 && (
                            <div>
                                <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                    What to check next
                                </p>
                                <ul className="mt-2 space-y-2">
                                    {mixExplanation.data.what_to_check_next
                                        .slice(0, 3)
                                        .map((action) => (
                                            <li
                                                key={`${action.action}-${action.where}`}
                                                className="text-sm"
                                            >
                                                <span className="font-medium">{action.action}</span>
                                                <span className="text-(--ink-muted)">
                                                    {" "}
                                                    - {action.why}
                                                </span>
                                                <span className="block text-xs text-(--ink-muted) opacity-70">
                                                    {action.where}
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
        </details>
    );
}
