import Link from "next/link";

import { ArrowRight } from "lucide-react";

import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { HeatmapPanel } from "@/components/charts/HeatmapPanel";
import { QuadrantPanel } from "@/components/charts/QuadrantPanel";
import {
    PageFactsEvidenceAction,
    type PageFact,
} from "@/components/evidence/PageFactsEvidenceAction";
import { MetricCard } from "@/components/metrics/MetricCard";
import { MetricStrip } from "@/components/metrics/MetricStrip";
import { buttonClassName } from "@/components/shared/Button";
import { MeterRows, type MeterRow } from "@/components/ui/MeterRows";
import { Section } from "@/components/ui/Section";
import { RepoEvidenceButton } from "./RepoEvidenceButton";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { getBusFactorData } from "@/lib/api/code";
import { checkApiHealth } from "@/lib/api/system";
import { getExplainData } from "@/lib/api/home";
import { getHomeDataViaGraphQL } from "@/lib/graphql/homeFetchers";
import { CTA_LABELS } from "@/lib/design/cta";
import { getHeatmap, getQuadrant } from "@/lib/api/visuals";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { formatMetricValue, formatNumber } from "@/lib/formatters";
import { resolveEntityLabel } from "@/lib/labels/entityLabel";
import { FALLBACK_DELTAS } from "@/lib/metrics/catalog";
import type { MetricDelta } from "@/lib/types";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";

type CodePageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

const getMetric = (deltas: MetricDelta[], metric: string) =>
    deltas.find((item) => item.metric === metric) ??
    FALLBACK_DELTAS.find((item) => item.metric === metric);

export default async function CodePage({ searchParams }: CodePageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;

    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);
    const scopeId = filters.scope.ids[0] ?? "";
    const quadrantScope: "org" | "team" | "repo" | "developer" =
        filters.scope.level === "developer"
            ? "developer"
            : filters.scope.level === "team" || filters.scope.level === "repo"
              ? filters.scope.level
              : "org";

    // Run health check in parallel with all data fetches to eliminate the waterfall.
    const [health, home, churnExplain, hotspotHeatmap, churnThroughput, busFactor] =
        await Promise.all([
            checkApiHealth(),
            fetchOrNull(getHomeDataViaGraphQL(filters), "code/home-data"),
            fetchOrNull(getExplainData({ metric: "churn", filters }), "code/explain-churn"),
            fetchOrNull(
                getHeatmap({
                    type: "risk",
                    metric: "hotspot_risk",
                    scope_type: filters.scope.level,
                    scope_id: scopeId,
                    range_days: filters.time.range_days,
                    start_date: filters.time.start_date,
                    end_date: filters.time.end_date,
                }),
                "code/hotspot-heatmap",
            ),
            fetchOrNull(
                getQuadrant({
                    type: "churn_throughput",
                    scope_type: quadrantScope,
                    scope_id: scopeId,
                    range_days: filters.time.range_days,
                    bucket: "week",
                    start_date: filters.time.start_date,
                    end_date: filters.time.end_date,
                }),
                "code/churn-throughput-quadrant",
            ),
            fetchOrNull(getBusFactorData(filters), "code/bus-factor"),
        ]);

    if (!health.ok) {
        return <ServiceUnavailable landmark={false} />;
    }

    const deltas = home?.deltas?.length ? home.deltas : FALLBACK_DELTAS;
    const placeholderDeltas = !home?.deltas?.length;

    const churnMetric = getMetric(deltas, "churn");
    const hotspots = (churnExplain?.contributors ?? []).slice(0, 6);
    const hotspotHighlights = hotspots
        .slice(0, 3)
        .map((item) => resolveEntityLabel(item.id, { name: item.label }).label);
    const hotspotSummary = hotspotHighlights.length
        ? `Leading hotspots: ${hotspotHighlights.join(", ")}. Higher values lean toward concentrated change and ownership load — open a cell to trace the files, PRs, and commits behind it.`
        : undefined;
    const hasBusFactorEvidence = (busFactor?.evidenceSampleCount ?? 0) > 0;
    const topMaintainers = (busFactor?.topMaintainers ?? []).slice(0, 5);
    const riskyRepos = (busFactor?.repos ?? [])
        .toSorted(
            (left, right) =>
                left.value - right.value || left.repoName.localeCompare(right.repoName),
        )
        .slice(0, 10);

    // Ownership concentration: the served shares, labelled as the prototype does (no names: a
    // ranking of people is not shown). The largest served share is the "Primary maintainer".
    const shares = [...topMaintainers].sort((l, r) => r.sharePercent - l.sharePercent).slice(0, 3);
    const ownershipRows: MeterRow[] = shares.map((share, index) => ({
        key: `share-${index}`,
        label: index === 0 ? "Primary maintainer" : "Other contributor",
        value: share.sharePercent,
        display: `${formatNumber(share.sharePercent, { maximumFractionDigits: 1 })}%`,
    }));

    // Hotspot score per repository: only where the churn explain serves a contributor for it.
    const hotspotScoreOf = (repo: { repoId: string; repoName: string }) => {
        const match = (churnExplain?.contributors ?? []).find(
            (item) => item.id === repo.repoId || item.label === repo.repoName,
        );
        return match && churnExplain
            ? formatMetricValue(match.value, churnExplain.unit)
            : undefined;
    };
    const repoRows = riskyRepos.map((repo) => ({
        repo,
        facts: {
            repoName: repo.repoName,
            hotspotScore: hotspotScoreOf(repo),
            busFactor: String(repo.value),
            samples: formatNumber(repo.evidenceSampleCount),
        },
    }));

    const churnText =
        placeholderDeltas || churnMetric?.value === undefined
            ? undefined
            : formatMetricValue(churnMetric.value, churnMetric.unit ?? "");
    const pageFacts: PageFact[] = [
        { label: churnMetric?.label ?? "Code Churn", value: churnText },
        {
            label: "File-change samples",
            value: busFactor ? formatNumber(busFactor.evidenceSampleCount) : undefined,
        },
        { label: "Bus factor", value: hasBusFactorEvidence ? String(busFactor?.value) : undefined },
        ...ownershipRows.map((row) => ({ label: row.label, value: row.display })),
        ...repoRows.map(({ repo, facts }) => ({
            label: repo.repoName,
            value: `Bus factor ${facts.busFactor} · ${facts.samples} samples${
                facts.hotspotScore ? ` · hotspot score ${facts.hotspotScore}` : ""
            }`,
        })),
    ];

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader
                title="Churn and Ownership"
                subtitle="Hotspots and ownership concentration in the selected window."
                actions={<PageFactsEvidenceAction title="Code" facts={pageFacts} />}
            >
                <p className="text-sm text-(--ink-muted)">Open a card to investigate.</p>
            </PageHeader>

            <ScopeBar view="code" />

            <MetricStrip data-testid="code-tiles">
                <MetricCard
                    label={churnMetric?.label ?? "Code Churn"}
                    href={buildExploreUrl({ metric: "churn", filters, role: activeRole })}
                    value={placeholderDeltas ? undefined : churnMetric?.value}
                    unit={churnMetric?.unit}
                    delta={placeholderDeltas ? undefined : churnMetric?.delta_pct}
                    spark={churnMetric?.spark}
                    caption="Churn over the active window"
                />
                {/* No data is "Not reported", never 0: samples need a bus-factor result; the bus
                    factor itself needs blame evidence (a value without samples is not a result). */}
                <MetricCard
                    label="File-change samples"
                    value={busFactor ? busFactor.evidenceSampleCount : undefined}
                    caption="Git blame aggregation"
                />
                <MetricCard
                    label="Bus factor"
                    value={hasBusFactorEvidence ? busFactor?.value : undefined}
                    caption="Scope-wide summary"
                />
            </MetricStrip>

            <Section
                data-testid="ownership-patterns-card"
                title="Ownership concentration"
                description="Git-blame shares of recent change; identity labels are aggregated, no names."
            >
                {hasBusFactorEvidence && ownershipRows.length ? (
                    <MeterRows
                        rows={ownershipRows}
                        max={100}
                        aria-label="Ownership concentration"
                    />
                ) : (
                    <p className="text-sm text-(--ink-muted)">
                        Connect a Git provider with commit history to surface ownership
                        concentration here.
                    </p>
                )}
            </Section>

            <Section
                data-testid="code-repo-bus-factor"
                title="Repository hotspots"
                description="Concentrated change and ownership are separate dimensions."
                action={
                    <Link
                        href={withFilterParam("/complexity?tab=hotspots", filters, activeRole)}
                        className={buttonClassName("ghost", "sm")}
                    >
                        <ArrowRight aria-hidden="true" className="h-4 w-4" />
                        {CTA_LABELS.fileLevelHotspots}
                    </Link>
                }
            >
                {repoRows.length ? (
                    <table className="w-full text-sm" data-testid="code-repo-bus-factor-table">
                        <thead className="text-label-caps uppercase text-(--ink-muted)">
                            <tr>
                                <th className="py-2 text-left font-medium">Repository</th>
                                <th className="py-2 text-left font-medium">Hotspot score</th>
                                <th className="py-2 text-left font-medium">Bus factor</th>
                                <th className="py-2 text-left font-medium">File-change samples</th>
                                <th className="py-2 text-right font-medium">
                                    <span className="sr-only">Evidence</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {repoRows.map(({ repo, facts }) => (
                                <tr key={repo.repoId} className="border-t border-(--card-stroke)">
                                    <td className="py-2.5">{repo.repoName}</td>
                                    <td
                                        data-testid="repo-hotspot-score"
                                        className={`py-2.5 tabular-nums ${
                                            facts.hotspotScore ? "" : "text-(--ink-muted)"
                                        }`}
                                    >
                                        {facts.hotspotScore ?? "Not reported"}
                                    </td>
                                    <td className="py-2.5 tabular-nums">{repo.value}</td>
                                    <td className="py-2.5 tabular-nums">{facts.samples}</td>
                                    <td className="py-1.5 text-right">
                                        <RepoEvidenceButton repo={facts} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p className="text-sm text-(--ink-muted)">
                        Connect a Git provider with commit history to surface bus-factor risk for
                        this view.
                    </p>
                )}
            </Section>

            <Section
                data-testid="code-complexity-links"
                title="Churn / ownership evidence"
                description="Open the file-level views behind these repository values."
            >
                <div className="grid gap-3 md:grid-cols-2">
                    {[
                        { label: CTA_LABELS.ownershipRisk, path: "/complexity?tab=ownership-risk" },
                        { label: CTA_LABELS.thirtyDayFileChurn, path: "/complexity?tab=churn" },
                    ].map((link) => (
                        <Link
                            key={link.path}
                            href={withFilterParam(link.path, filters, activeRole)}
                            className={buttonClassName("secondary")}
                        >
                            <ArrowRight aria-hidden="true" className="h-4 w-4" />
                            {link.label}
                        </Link>
                    ))}
                </div>
            </Section>

            <section>
                <HeatmapPanel
                    title="Hotspot concentration"
                    description="Where churn and ownership load accumulate over time."
                    request={{
                        type: "risk",
                        metric: "hotspot_risk",
                        scope_type: filters.scope.level,
                        scope_id: scopeId,
                        range_days: filters.time.range_days,
                        start_date: filters.time.start_date,
                        end_date: filters.time.end_date,
                    }}
                    initialData={hotspotHeatmap}
                    emptyState="Hotspot heatmap unavailable."
                    evidenceTitle="Hotspot evidence"
                    defaultSummary={hotspotSummary}
                    flatStateLabel="No hotspot variance in this window — churn is evenly spread, so no single area stands out yet."
                />
            </section>

            <section>
                <QuadrantPanel
                    title="Churn × Throughput landscape"
                    description="Operating modes under change volume and delivery pace."
                    data={churnThroughput}
                    filters={filters}
                    emptyState="Quadrant data unavailable for this scope."
                />
            </section>

            <Section
                data-testid="code-hotspots-card"
                title="Hotspots"
                description="The churn contributors behind the repository values."
                action={
                    <Link
                        href={buildExploreUrl({ metric: "ownership", filters, role: activeRole })}
                        className={buttonClassName("ghost", "sm")}
                    >
                        <ArrowRight aria-hidden="true" className="h-4 w-4" />
                        {CTA_LABELS.openEvidence}
                    </Link>
                }
            >
                {hotspots.length ? (
                    <div className="space-y-4">
                        <HorizontalBarChart
                            categories={hotspots.map((item) => item.label)}
                            values={hotspots.map((item) => item.value)}
                        />
                        <div className="space-y-2 text-sm">
                            {hotspots.map((item) => (
                                <Link
                                    key={item.id}
                                    href={buildExploreUrl({
                                        api: item.evidence_link,
                                        filters,
                                        role: activeRole,
                                    })}
                                    className="flex items-center justify-between rounded-sm bg-background px-3.5 py-2.5"
                                >
                                    <span>{item.label}</span>
                                    <span className="text-xs text-(--ink-muted)">
                                        {churnExplain
                                            ? formatMetricValue(item.value, churnExplain.unit)
                                            : "Not reported"}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-(--ink-muted)">
                        Hotspot detail will appear once data is ingested.
                    </p>
                )}
            </Section>
        </div>
    );
}
