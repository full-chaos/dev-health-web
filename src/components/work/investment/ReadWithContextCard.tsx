"use client";

import { ArrowRight, ChevronDown, ChevronRight } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import Link from "next/link";

import { Button, buttonClassName } from "@/components/shared/Button";
import { Section } from "@/components/ui/Section";
import { CTA_LABELS } from "@/lib/design/cta";
import { formatNumber } from "@/lib/formatters";
import type { SankeyResponse } from "@/lib/types";
import { asPct, combineCoverage } from "./AllocationCoverage";
import { confidenceToneClass } from "./ConfidencePanel";
import type { MixExplanationState } from "./types";

type ReadWithContextCardProps = {
    mixExplanation: MixExplanationState;
    mixExplainKey: string;
    teamCategoryFlow: SankeyResponse | null | undefined;
    repoTeamFlow: SankeyResponse | null | undefined;
    isCoverageLoading: boolean;
    /** Href of the Confidence tab (carries the page's filters). */
    confidenceHref: string;
    /** The labelled AI explanation block. Collapsed until the reader asks for it. */
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
 *
 * The prototype card has no AI block: the AI explanation stays reachable behind a ghost
 * "Show AI explanation" button and is collapsed by default.
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
    const [showAi, setShowAi] = useState(false);
    const aiRegionId = useId();

    return (
        <Section title="Read this with context" data-testid="read-with-context">
            <p className="text-label-caps uppercase text-(--ink-muted)">Evidence quality</p>
            {confidence ? (
                <div className="mt-2" data-testid="context-quality">
                    <div className="flex flex-wrap items-center gap-2">
                        <span
                            className={`rounded-full px-2 py-0.5 text-xs uppercase ${confidenceToneClass(
                                confidence.level,
                            )}`}
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
            <Link href={confidenceHref} className={buttonClassName("primary", "md", "mt-4")}>
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
                {CTA_LABELS.inspectConfidence}
            </Link>
            <div className="mt-5 border-t border-(--card-stroke) pt-3">
                <Button
                    variant="ghost"
                    size="sm"
                    icon={showAi ? <ChevronDown /> : <ChevronRight />}
                    aria-expanded={showAi}
                    aria-controls={aiRegionId}
                    data-testid="ai-explanation-toggle"
                    onClick={() => setShowAi((open) => !open)}
                >
                    {showAi ? CTA_LABELS.hideAiExplanation : CTA_LABELS.showAiExplanation}
                </Button>
                <div id={aiRegionId} hidden={!showAi} data-testid="ai-explanation-region">
                    {showAi ? <div className="mt-3">{children}</div> : null}
                </div>
            </div>
        </Section>
    );
}
