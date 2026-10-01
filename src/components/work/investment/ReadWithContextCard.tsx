import type { ReactNode } from "react";
import Link from "next/link";

import { CTA_LABELS } from "@/lib/design/cta";
import { formatNumber } from "@/lib/formatters";
import type { SankeyResponse } from "@/lib/types";
import { asPct, combineCoverage } from "./AllocationCoverage";
import { CONFIDENCE_TONE } from "./ConfidencePanel";
import type { MixExplanationState } from "./types";

type ReadWithContextCardProps = {
    mixExplanation: MixExplanationState;
    mixExplainKey: string;
    teamCategoryFlow: SankeyResponse | null | undefined;
    repoTeamFlow: SankeyResponse | null | undefined;
    isCoverageLoading: boolean;
    /** Href of the Confidence tab (carries the page's filters). */
    confidenceHref: string;
    /** The labelled AI explanation block. */
    children: ReactNode;
};

function Fact({ label, value, testId }: { label: string; value: string; testId: string }) {
    return (
        <div className="flex items-baseline justify-between gap-3 border-b border-(--card-stroke) py-2 text-sm">
            <dt className="text-(--ink-muted)">{label}</dt>
            <dd className="font-medium tabular-nums" data-testid={testId}>
                {value}
            </dd>
        </div>
    );
}

/**
 * "Read this with context": the evidence-quality line, the coverage facts and the AI
 * explanation in one card. Every number comes from a value the page already reads:
 * the confidence level and mean from the explanation (the same fields, and the same
 * formatting, as the Confidence tab's "Classification confidence"), coverage from
 * `combineCoverage` (the Allocation strip). Nothing here is computed afresh.
 */
export function ReadWithContextCard({
    mixExplanation,
    mixExplainKey,
    teamCategoryFlow,
    repoTeamFlow,
    isCoverageLoading,
    confidenceHref,
    children,
}: ReadWithContextCardProps) {
    const explained =
        mixExplanation.data &&
        mixExplanation.data.status !== "llm_unavailable" &&
        mixExplanation.filtersKey === mixExplainKey
            ? mixExplanation.data
            : null;
    const confidence = explained?.confidence ?? null;
    const coverage = combineCoverage(teamCategoryFlow, repoTeamFlow);
    const pct = (value: number | null) => (value === null ? "unavailable" : `${asPct(value)}%`);

    return (
        <section
            className="rounded-3xl border border-(--card-stroke) bg-card p-5"
            aria-label="Read this with context"
            data-testid="read-with-context"
        >
            <h3 className="font-(--font-display) text-lg">Read this with context</h3>
            <p className="mt-3 text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                Evidence quality
            </p>
            {confidence ? (
                <div className="mt-2" data-testid="context-quality">
                    <div className="flex flex-wrap items-center gap-2">
                        <span
                            className={`rounded-full px-2 py-0.5 text-xs uppercase ${
                                CONFIDENCE_TONE[confidence.level ?? ""] ??
                                "bg-(--card-stroke) text-(--ink-muted)"
                            }`}
                        >
                            {confidence.level ?? "unknown"}
                        </span>
                        {confidence.level === "low" && (
                            <span className="rounded-full border border-(--card-stroke) px-2 py-0.5 text-xs text-(--ink-muted)">
                                Confidence caveat
                            </span>
                        )}
                    </div>
                    {confidence.quality_mean != null && (
                        <p className="mt-2 text-xs text-(--ink-muted)">
                            Mean evidence quality:{" "}
                            {formatNumber(confidence.quality_mean * 100, {
                                maximumFractionDigits: 0,
                            })}
                            %
                            {confidence.quality_stddev != null &&
                                ` ± ${formatNumber(confidence.quality_stddev * 100, {
                                    maximumFractionDigits: 0,
                                })}%`}
                        </p>
                    )}
                    {confidence.level === "low" && (
                        <p className="mt-2 text-sm text-(--ink-muted)">
                            Evidence quality appears low for some classifications. Inspect the
                            underlying work before relying on this view for an allocation decision.
                        </p>
                    )}
                </div>
            ) : (
                <p className="mt-2 text-sm text-(--ink-muted)" data-testid="context-quality">
                    unavailable
                </p>
            )}
            <dl className="mt-4">
                <Fact
                    label="Team coverage"
                    value={isCoverageLoading ? "loading" : pct(coverage.teamCoverage)}
                    testId="context-team-coverage"
                />
                <Fact
                    label="Repo coverage"
                    value={isCoverageLoading ? "loading" : pct(coverage.repoCoverage)}
                    testId="context-repo-coverage"
                />
                <Fact
                    label="Unassigned ownership"
                    value={
                        isCoverageLoading
                            ? "loading"
                            : coverage.unassignedShare !== null
                              ? `${asPct(coverage.unassignedShare)}%`
                              : coverage.teamCoverage === null && coverage.repoCoverage === null
                                ? "unavailable"
                                : "none detected"
                    }
                    testId="context-unassigned"
                />
            </dl>
            <Link
                href={confidenceHref}
                className="mt-4 inline-block text-xs uppercase tracking-[0.18em] text-(--accent-2) hover:underline"
            >
                {CTA_LABELS.inspectConfidence}
            </Link>
            <div className="mt-5 border-t border-(--card-stroke) pt-4">{children}</div>
        </section>
    );
}
