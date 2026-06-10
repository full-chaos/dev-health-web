"use client";

import Link from "next/link";

import { DataState } from "@/components/ui/DataState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { useImproveOpportunities } from "@/lib/graphql/hooks/useImproveOpportunities";
import { ImproveOpportunityList } from "./ImproveOpportunityList";

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
    const { data, fetching, error } = useImproveOpportunities();
    const result = data?.improveOpportunities;

    if (error) {
        return (
            <ErrorCard
                title="Flow opportunities could not load"
                message={error.message ?? "Please retry the request."}
            />
        );
    }

    if (fetching && !result) {
        return <AutomationsSkeleton />;
    }

    return (
        <div className="flex flex-col gap-6" data-testid="improve-automations-dashboard">
            {/* ── Flow opportunity candidates ─────────────────────────────── */}
            <section
                className="rounded-3xl border border-(--border) bg-card p-5 shadow-sm"
                data-testid="improve-automations-flow-panel"
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="font-(--font-display) text-lg font-semibold">
                            Flow improvement opportunities
                        </h2>
                        <p className="mt-1 text-sm text-(--ink-muted)">
                            Non-AI, threshold-based signals — review latency, cycle time, rework,
                            WIP congestion, throughput, churn, and change failure rate. Each fires
                            only when metric values exceed documented thresholds.
                        </p>
                    </div>
                </div>
                <div className="mt-4">
                    {result ? (
                        <ImproveOpportunityList
                            detectorReady={result.detectorReady}
                            opportunities={result.opportunities}
                        />
                    ) : (
                        <DataState variant="loading" />
                    )}
                </div>
            </section>

            {/* ── AI-workflow cross-link ───────────────────────────────────── */}
            <section
                className="rounded-3xl border border-(--border) bg-(--card-80) p-5"
                data-testid="improve-automations-ai-crosslink"
            >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h3 className="font-(--font-display) text-base font-semibold">
                            Looking for AI-workflow automation opportunities?
                        </h3>
                        <p className="mt-1 text-sm text-(--ink-muted)">
                            Repeatable patterns best suited for responsible automation — agent
                            creation, test generation, dependency updates, and more — live under the
                            AI surface.
                        </p>
                    </div>
                    <Link
                        href={aiAutomationsHref}
                        className="shrink-0 rounded-2xl border border-(--border) bg-background px-4 py-2 text-sm font-medium hover:bg-(--card-80) transition-colors"
                        data-testid="improve-automations-ai-link"
                    >
                        View AI automations →
                    </Link>
                </div>
            </section>
        </div>
    );
}

function AutomationsSkeleton() {
    return (
        <div
            className="rounded-3xl border border-(--border) bg-card p-5"
            data-testid="improve-automations-loading"
        >
            <div className="h-40 animate-pulse rounded-2xl bg-(--card-80)" />
        </div>
    );
}
