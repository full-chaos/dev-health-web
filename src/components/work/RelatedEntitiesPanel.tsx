import Link from "next/link";

import type {
    AIWorkflowDrilldownResult,
    AIWorkflowGraphEdge,
    AIWorkflowRootTypeInput,
    WorkUnitInvestmentDistribution,
} from "@/lib/graphql/types";
import { formatNumber } from "@/lib/formatters";
import { labelInvestmentKey } from "@/lib/workGraph/taxonomy";

type RelatedEntitiesPanelProps = {
    rootType: AIWorkflowRootTypeInput;
    rootId: string;
    drilldown: AIWorkflowDrilldownResult;
    investment: WorkUnitInvestmentDistribution;
    /** True when the related-entities/Work Graph evidence fetch failed (distinct from a genuine empty result). */
    relatedEntitiesError?: boolean;
};

const entityLabels: Record<string, string> = {
    ISSUE: "Issues",
    PR: "Pull requests",
    REVIEW_OUTCOME: "Reviews",
    COMMIT: "Commits",
    FILE: "Files",
    DEPLOYMENT: "Deployments",
    INCIDENT: "Incidents",
};

const entityOrder = ["ISSUE", "PR", "REVIEW_OUTCOME", "COMMIT", "FILE", "DEPLOYMENT", "INCIDENT"];

function entityHref(type: string, id: string): string {
    switch (type) {
        case "ISSUE":
            return `/issues/${encodeURIComponent(id)}`;
        case "PR":
            return `/prs/${encodeURIComponent(id)}`;
        case "DEPLOYMENT":
            return `/deployments/${encodeURIComponent(id)}`;
        case "COMMIT":
            return `/code?commit=${encodeURIComponent(id)}`;
        case "INCIDENT":
            return `/ai/risk?incident=${encodeURIComponent(id)}`;
        default:
            return `/diagnose/work-graph?context_entity_id=${encodeURIComponent(id)}&context_entity_label=${encodeURIComponent(type)}`;
    }
}

function evidenceQuality(confidence: number): string {
    if (confidence >= 0.95) return "High";
    if (confidence >= 0.75) return "Medium";
    return "Low";
}

function topDistributionEntry(distribution: Record<string, number | undefined>) {
    return Object.entries(distribution)
        .filter((entry): entry is [string, number] => typeof entry[1] === "number")
        .sort((a, b) => b[1] - a[1])[0];
}

function collectRelatedEdges(
    rootType: AIWorkflowRootTypeInput,
    rootId: string,
    edges: AIWorkflowGraphEdge[],
) {
    const rootConnected = edges.some(
        (edge) =>
            (edge.sourceType === rootType && edge.sourceId === rootId) ||
            (edge.targetType === rootType && edge.targetId === rootId),
    );
    return rootConnected ? edges : [];
}

function groupEdgesByRelatedType(
    rootType: AIWorkflowRootTypeInput,
    rootId: string,
    edges: AIWorkflowGraphEdge[],
): Map<string, AIWorkflowGraphEdge[]> {
    const grouped = new Map<string, AIWorkflowGraphEdge[]>();
    for (const edge of edges) {
        const type =
            edge.targetType === rootType && edge.targetId === rootId
                ? edge.sourceType
                : edge.targetType;
        grouped.set(type, [...(grouped.get(type) ?? []), edge]);
    }
    return grouped;
}

export function RelatedEntitiesPanel({
    rootType,
    rootId,
    drilldown,
    investment,
    relatedEntitiesError = false,
}: RelatedEntitiesPanelProps) {
    const theme = topDistributionEntry(investment.themeDistribution);
    const subcategory = topDistributionEntry(investment.subcategoryDistribution);
    const relatedEdges = collectRelatedEdges(rootType, rootId, drilldown.edges);
    const grouped = groupEdgesByRelatedType(rootType, rootId, relatedEdges);

    return (
        <section className="rounded-3xl border border-(--card-stroke) bg-(--card) p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                        Work Graph evidence
                    </p>
                    <h2 className="mt-2 font-(--font-display) text-2xl">Related entities</h2>
                    <p className="mt-2 max-w-2xl text-sm text-(--ink-muted)">
                        Connected issues, PRs, reviews, commits, deployments, and incidents with the
                        relationship evidence that created each edge.
                    </p>
                </div>
                <div className="rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-3 text-sm">
                    <p className="text-xs uppercase tracking-[0.18em] text-(--ink-muted)">
                        Investment theme
                    </p>
                    <p className="mt-1 font-medium">
                        {theme ? labelInvestmentKey(theme[0]) : "No data"}
                    </p>
                    <p className="mt-1 text-xs text-(--ink-muted)">
                        {subcategory
                            ? `${labelInvestmentKey(subcategory[0])} · ${formatNumber(subcategory[1] * 100, { maximumFractionDigits: 0 })}%`
                            : "No data"}
                    </p>
                </div>
            </div>

            {relatedEntitiesError ? (
                <div
                    data-testid="related-entities-error"
                    className="mt-6 rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) p-5 text-sm text-(--ink-muted)"
                >
                    Related work unavailable. Work Graph evidence could not be loaded from the
                    backend; try again once the data service recovers.
                </div>
            ) : relatedEdges.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) p-5 text-sm text-(--ink-muted)">
                    No data for related entities.
                </div>
            ) : (
                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                    {entityOrder.map((type) => {
                        const edges = grouped.get(type) ?? [];
                        if (edges.length === 0) return null;
                        return (
                            <div
                                key={type}
                                className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4"
                            >
                                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-(--ink-muted)">
                                    {entityLabels[type] ?? labelInvestmentKey(type)}
                                </h3>
                                <div className="mt-4 space-y-3">
                                    {edges.map((edge) => {
                                        const linkedType =
                                            edge.sourceType === type
                                                ? edge.sourceType
                                                : edge.targetType;
                                        const linkedId =
                                            edge.sourceType === type
                                                ? edge.sourceId
                                                : edge.targetId;
                                        return (
                                            <article
                                                key={edge.edgeId}
                                                className="rounded-2xl border border-(--card-stroke) bg-background/35 p-4"
                                            >
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <Link
                                                        href={entityHref(linkedType, linkedId)}
                                                        className="font-medium underline-offset-4 hover:underline"
                                                    >
                                                        {linkedId}
                                                    </Link>
                                                    <span className="rounded-full border border-(--card-stroke) px-3 py-1 text-xs uppercase tracking-[0.18em] text-(--ink-muted)">
                                                        {labelInvestmentKey(edge.edgeType)}
                                                    </span>
                                                </div>
                                                <p className="mt-3 text-sm text-(--ink-muted)">
                                                    {edge.evidence || "No data"}
                                                </p>
                                                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs text-(--ink-muted)">
                                                    <div>
                                                        <dt className="uppercase tracking-[0.16em]">
                                                            Evidence quality
                                                        </dt>
                                                        <dd className="mt-1 text-foreground">
                                                            {evidenceQuality(edge.confidence)} ·{" "}
                                                            {formatNumber(edge.confidence * 100, {
                                                                maximumFractionDigits: 0,
                                                            })}
                                                            %
                                                        </dd>
                                                    </div>
                                                    <div>
                                                        <dt className="uppercase tracking-[0.16em]">
                                                            Provenance
                                                        </dt>
                                                        <dd className="mt-1 text-foreground">
                                                            {edge.source ||
                                                                edge.provider ||
                                                                "No data"}
                                                        </dd>
                                                    </div>
                                                </dl>
                                            </article>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="mt-6 rounded-2xl border border-(--card-stroke) bg-background/35 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-(--ink-muted)">
                    Evidence quotes
                </h3>
                {investment.evidenceQuotes.length === 0 ? (
                    <p className="mt-3 text-sm text-(--ink-muted)">No data for evidence quotes.</p>
                ) : (
                    <ul className="mt-3 space-y-2 text-sm text-(--ink-muted)">
                        {investment.evidenceQuotes.map((quote) => (
                            <li key={`${quote.sourceType}:${quote.sourceId}:${quote.quote}`}>
                                “{quote.quote}”{" "}
                                <span className="text-foreground">
                                    {quote.sourceType}:{quote.sourceId}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}
