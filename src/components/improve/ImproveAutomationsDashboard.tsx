"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { DataState } from "@/components/ui/DataState";
import { MetricCard } from "@/components/metrics/MetricCard";
import { MetricStrip } from "@/components/metrics/MetricStrip";
import { Button, buttonClassName } from "@/components/shared/Button";
import { Notice } from "@/components/ui/Notice";
import { Section } from "@/components/ui/Section";
import { CTA_LABELS } from "@/lib/design/cta";
import { useImproveOpportunities } from "@/lib/graphql/hooks/useImproveOpportunities";
import { ImproveOpportunityList, kindLabel } from "./ImproveOpportunityList";

type ImproveAutomationsDashboardProps = {
    /** Pre-encoded filter string to forward to the AI/automations cross-link. */
    aiAutomationsHref: string;
};

/**
 * Dashboard for the Improve → Automations surface.
 *
 * Renders non-AI flow opportunity candidates (review latency, cycle time,
 * rework, WIP, throughput, churn, change failure) and a prominent cross-link
 * to /ai/automations for AI-workflow opportunity kinds.
 */
export function ImproveAutomationsDashboard({
    aiAutomationsHref,
}: ImproveAutomationsDashboardProps) {
    const { data, fetching, error, retry } = useImproveOpportunities();
    const result = data?.improveOpportunities;

    if (error) {
        return (
            <DataState
                variant="error"
                title="Flow opportunities could not load"
                message={error.message ?? "Please retry the request."}
                action={
                    <Button onClick={retry} data-testid="improve-automations-retry">
                        {CTA_LABELS.retry}
                    </Button>
                }
                data-testid="improve-automations-error"
            />
        );
    }

    if (fetching && !result) {
        return <AutomationsSkeleton />;
    }

    // Counts: "--" when the detector cannot say (not ready), a real 0 when it ran and found none.
    const ready = result?.detectorReady === true;
    const items = result?.opportunities ?? [];
    const kindCounts = new Map<string, number>();
    for (const item of items) kindCounts.set(item.kind, (kindCounts.get(item.kind) ?? 0) + 1);

    return (
        <div className="flex flex-col gap-6" data-testid="improve-automations-dashboard">
            {/* ── Counts from the same list ───────────────────────────────── */}
            <MetricStrip data-testid="improve-automations-tiles">
                <MetricCard
                    label="Detected signals"
                    value={ready ? result?.totalCount : undefined}
                    hideTrend
                    deltaSlot={<span>{ready ? "This window" : "No data"}</span>}
                />
                {ready
                    ? [...kindCounts.entries()].map(([kind, count]) => (
                          <MetricCard
                              key={kind}
                              label={kindLabel(kind)}
                              value={count}
                              hideTrend
                              deltaSlot={<span>In the list</span>}
                          />
                      ))
                    : null}
            </MetricStrip>

            {/* ── Flow opportunity candidates ─────────────────────────────── */}
            <Section
                data-testid="improve-automations-flow-panel"
                title="Automation candidates"
                description="Non-AI, threshold-based signals — review latency, cycle time, rework, WIP congestion, throughput, churn, and change failure rate. Each fires only when metric values exceed documented thresholds."
                action={
                    <Link
                        href={aiAutomationsHref}
                        className={buttonClassName("ghost", "sm")}
                        data-testid="improve-automations-head-link"
                    >
                        {CTA_LABELS.seeAIAutomations}
                        <ArrowRight aria-hidden="true" className="h-4 w-4" />
                    </Link>
                }
            >
                {result ? (
                    <ImproveOpportunityList
                        detectorReady={result.detectorReady}
                        opportunities={result.opportunities}
                    />
                ) : (
                    <DataState variant="loading" />
                )}
            </Section>

            {/* ── AI-workflow cross-link ───────────────────────────────────── */}
            <Notice
                variant="info"
                live={false}
                title="Looking for AI-workflow automation opportunities?"
                titleAs="h3"
                data-testid="improve-automations-ai-crosslink"
                action={
                    <Link
                        href={aiAutomationsHref}
                        className={buttonClassName("secondary", "sm")}
                        data-testid="improve-automations-ai-link"
                    >
                        View AI automations →
                    </Link>
                }
            >
                Repeatable patterns best suited for responsible automation — agent creation, test
                generation, dependency updates, and more — live under the AI surface. These
                detections belong to Improve; AI automation opportunities remain in the AI area.
            </Notice>
        </div>
    );
}

function AutomationsSkeleton() {
    return (
        <div className="flex flex-col gap-6" data-testid="improve-automations-loading">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-28 animate-pulse rounded-2xl bg-(--card-80)" />
                ))}
            </div>
            <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
                <div className="h-40 animate-pulse rounded-2xl bg-(--card-80)" />
            </div>
        </div>
    );
}
