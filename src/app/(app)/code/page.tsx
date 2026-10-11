import { Suspense } from "react";

import Link from "next/link";

import { ArrowRight } from "lucide-react";

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
import { UNKNOWN } from "@/components/evidence/EvidenceFacts";
import { ChurnTrend } from "./ChurnTrend";
import { RepoEvidenceButton } from "./RepoEvidenceButton";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { getBusFactorData, getRepoTopHotspots } from "@/lib/api/code";
import { checkApiHealth } from "@/lib/api/system";
import { getExplainData } from "@/lib/api/home";
import { getHomeDataViaGraphQL } from "@/lib/graphql/homeFetchers";
import { CTA_LABELS } from "@/lib/design/cta";
import { appHref } from "@/lib/navigation/appPath";
import { getQuadrant } from "@/lib/api/visuals";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { formatMetricValue, formatNumber } from "@/lib/formatters";
import {
    metricCardProps,
    metricDisplay,
    noDataText,
    readFailedCardProps,
} from "@/lib/metrics/metricDisplay";
import { FALLBACK_DELTAS } from "@/lib/metrics/catalog";
import { READ_FAILED_MESSAGE } from "@/lib/readFailure";
import type { MetricDelta } from "@/lib/types";
import type { MetricFilter } from "@/lib/filters/types";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";
import { filtersFromPageParams } from "@/components/shell/scopeBarConfig";

type CodePageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

const getMetric = (deltas: MetricDelta[], metric: string) =>
    deltas.find((item) => item.metric === metric) ??
    FALLBACK_DELTAS.find((item) => item.metric === metric);

type Home = Awaited<ReturnType<typeof getHomeDataViaGraphQL>>;
type Explain = Awaited<ReturnType<typeof getExplainData>>;
type BusFactor = Awaited<ReturnType<typeof getBusFactorData>>;
type Hotspots = Awaited<ReturnType<typeof getRepoTopHotspots>>;
type Quadrant = Awaited<ReturnType<typeof getQuadrant>>;

/** Each read of the page starts once, then each section waits only for the reads it draws. */
type CodeReads = {
    home: Promise<Home | null>;
    churnExplain: Promise<Explain | null>;
    busFactor: Promise<BusFactor | null>;
    repoHotspots: Promise<Hotspots | null>;
    churnThroughput: Promise<Quadrant | null>;
};

type SectionProps = {
    reads: CodeReads;
    filters: MetricFilter;
    activeRole: string | undefined;
};

/** A section that has not drawn yet: a block of the section's own size, not the whole page. */
function SectionSkeleton({ height = "h-40" }: { height?: string }) {
    return (
        <div
            aria-hidden="true"
            data-testid="section-skeleton"
            className={`${height} animate-pulse rounded-lg bg-(--card-stroke)/40`}
        />
    );
}

type Data = {
    home: Home | null;
    churnExplain: Explain | null;
    busFactor: BusFactor | null;
    repoHotspots: Hotspots | null;
};

/** The drawn values of the page, from the reads a section holds (a read it does not hold is null). */
function derive(
    { home, churnExplain, busFactor, repoHotspots }: Data,
    filters: MetricFilter,
    activeRole: string | undefined,
) {
    const deltas = home?.deltas?.length ? home.deltas : FALLBACK_DELTAS;
    const placeholderDeltas = !home?.deltas?.length;

    const churnMetric = getMetric(deltas, "churn");
    // The churn entry the API served (no fallback): its daily series is the Churn trend.
    const servedChurn = home?.deltas?.find((item) => item.metric === "churn");
    const hasBusFactorEvidence = (busFactor?.evidenceSampleCount ?? 0) > 0;
    const hasSamples = (busFactor?.evidenceSampleCount ?? 0) > 0;
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

    // Churn per repository, from the churn explain contributors. It is churn, NOT the hotspot score
    // (a different metric: the heatmap's "hotspot score"), so it never fills the Top hotspot column.
    // That column shows the served top file of each repository and its served file score as the
    // driver; there is no repository score and no hotspot count (no threshold is defined).
    const topHotspotOf = (repo: { repoId: string; repoName: string }) =>
        (repoHotspots ?? []).find(
            (item) => item.repoId === repo.repoId || item.repoName === repo.repoName,
        );
    const contributorOf = (repo: { repoId: string; repoName: string }) =>
        (churnExplain?.contributors ?? []).find(
            (item) => item.id === repo.repoId || item.label === repo.repoName,
        );
    const churnOf = (repo: { repoId: string; repoName: string }) => {
        const match = contributorOf(repo);
        return match && churnExplain
            ? formatMetricValue(match.value, churnExplain.unit)
            : undefined;
    };
    const repoRows = riskyRepos.map((repo) => ({
        repo,
        topHotspot: topHotspotOf(repo),
        facts: {
            repoName: repo.repoName,
            churn: churnOf(repo),
            // The served evidence link of this repository's churn contributor (it was a row of the
            // removed "Hotspots" card); it opens from the row drawer.
            evidenceHref: contributorOf(repo)?.evidence_link
                ? buildExploreUrl({
                      api: contributorOf(repo)?.evidence_link,
                      filters,
                      role: activeRole,
                  })
                : undefined,
            busFactor: String(repo.value),
            samples: formatNumber(repo.evidenceSampleCount),
            // Ownership facts as served for this repository: the name and its share, in the order
            // served (not a ranking on the page); they open in the row drawer only.
            maintainers: repo.topMaintainers.map((m) => ({
                name: m.author,
                share: `${formatNumber(m.sharePercent, { maximumFractionDigits: 1 })}%`,
            })),
        },
    }));

    // `null` is a FAILED Home read: the churn tile and its page fact say so (CHAOS-9189).
    const homeReadFailed = home === null;
    const churnText = homeReadFailed
        ? READ_FAILED_MESSAGE
        : placeholderDeltas ||
            !metricDisplay(churnMetric).hasData ||
            churnMetric?.value === undefined
          ? undefined
          : formatMetricValue(churnMetric.value, churnMetric.unit ?? "");
    const pageFacts: PageFact[] = [
        { label: churnMetric?.label ?? "Code Churn", value: churnText },
        {
            label: "File-change samples",
            // A served 0 samples is a no-data state, not a fact (CHAOS-9154).
            value: hasSamples ? formatNumber(busFactor?.evidenceSampleCount ?? 0) : undefined,
        },
        { label: "Bus factor", value: hasBusFactorEvidence ? String(busFactor?.value) : undefined },
        ...ownershipRows.map((row) => ({ label: row.label, value: row.display })),
        ...repoRows.map(({ repo, facts }) => ({
            label: repo.repoName,
            value: `Bus factor ${facts.busFactor} · ${facts.samples} samples${
                facts.churn ? ` · churn ${facts.churn}` : ""
            }`,
        })),
    ];

    return {
        deltas,
        placeholderDeltas,
        churnMetric,
        servedChurn,
        hasBusFactorEvidence,
        hasSamples,
        ownershipRows,
        repoRows,
        homeReadFailed,
        churnText,
        pageFacts,
        busFactor,
        home,
    };
}

async function resolveReads<K extends keyof CodeReads>(reads: CodeReads, keys: K[]) {
    const values = await Promise.all(keys.map((key) => reads[key]));
    return Object.fromEntries(keys.map((key, i) => [key, values[i]])) as {
        [P in K]: Awaited<CodeReads[P]>;
    };
}

async function CodeTilesSection({ reads, filters, activeRole }: SectionProps) {
    const { home, busFactor } = await resolveReads(reads, ["home", "busFactor"]);
    const { churnMetric, placeholderDeltas, homeReadFailed, hasSamples, hasBusFactorEvidence } =
        derive({ home, busFactor, churnExplain: null, repoHotspots: null }, filters, activeRole);
    return (
        <MetricStrip data-testid="code-tiles">
            <MetricCard
                label={churnMetric?.label ?? "Code Churn"}
                href={buildExploreUrl({ metric: "churn", filters, role: activeRole })}
                {...(homeReadFailed
                    ? readFailedCardProps()
                    : metricCardProps(placeholderDeltas ? null : churnMetric))}
                spark={homeReadFailed ? undefined : churnMetric?.spark}
                caption="Churn over the active window"
            />
            {/* No data is "Not reported", never 0: samples need a bus-factor result; the bus
                factor itself needs blame evidence (a value without samples is not a result).
                A served row with 0 samples is a no-data state too, drawn as the churn tile
                draws it (CHAOS-9154). */}
            <MetricCard
                label="File-change samples"
                {...(busFactor && !hasSamples
                    ? {
                          valueText: noDataText(),
                          valueIsMessage: true,
                          deltaSlot: <></>,
                          hideTrend: true,
                      }
                    : { value: busFactor ? busFactor.evidenceSampleCount : undefined })}
                caption="Git blame aggregation"
            />
            <MetricCard
                label="Bus factor"
                value={hasBusFactorEvidence ? busFactor?.value : undefined}
                caption="Scope-wide summary"
            />
        </MetricStrip>
    );
}

async function CodeTrendOwnershipSection({ reads, filters, activeRole }: SectionProps) {
    const { home, busFactor } = await resolveReads(reads, ["home", "busFactor"]);
    const { servedChurn, hasBusFactorEvidence, ownershipRows } = derive(
        { home, busFactor, churnExplain: null, repoHotspots: null },
        filters,
        activeRole,
    );
    // Approved layout (prototype `code()`): the churn trend beside the ownership shares.
    return (
        <div
            className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]"
            data-testid="code-trend-ownership"
        >
            <ChurnTrend readFailed={home === null} spark={servedChurn?.spark} />

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
        </div>
    );
}

async function CodeRepoHotspotsSection({ reads, filters, activeRole }: SectionProps) {
    const data = await resolveReads(reads, ["busFactor", "churnExplain", "repoHotspots"]);
    const { repoRows } = derive({ ...data, home: null }, filters, activeRole);
    return (
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
                            <th className="py-2 text-left font-medium">Bus factor</th>
                            <th className="py-2 text-left font-medium">Churn</th>
                            <th className="py-2 text-left font-medium">Top hotspot</th>
                            <th className="py-2 text-left font-medium">File-change samples</th>
                            <th className="py-2 text-right font-medium">
                                {/* design-lint-disable-next-line cta-from-registry -- screen-reader-only table-column header; not an action */}
                                <span className="sr-only">Evidence</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {repoRows.map(({ repo, facts, topHotspot }) => (
                            <tr key={repo.repoId} className="border-t border-(--card-stroke)">
                                <td className="py-2.5">{repo.repoName}</td>
                                <td className="py-2.5 tabular-nums">{repo.value}</td>
                                <td
                                    data-testid="repo-churn"
                                    className={`py-2.5 tabular-nums ${
                                        facts.churn ? "" : "text-(--ink-muted)"
                                    }`}
                                >
                                    {facts.churn ?? UNKNOWN}
                                </td>
                                <td data-testid="repo-top-hotspot" className="py-2.5">
                                    {topHotspot ? (
                                        <span className="inline-flex max-w-xs items-baseline gap-1">
                                            {topHotspot.evidenceUrl ? (
                                                <Link
                                                    // CHAOS-9209: a served URL goes through appHref;
                                                    // one link for each row, so no prefetch.
                                                    href={appHref(topHotspot.evidenceUrl)}
                                                    prefetch={false}
                                                    title={topHotspot.topFilePath}
                                                    className="truncate text-(--accent-2) hover:underline"
                                                >
                                                    {topHotspot.topFilePath}
                                                </Link>
                                            ) : (
                                                <span
                                                    title={topHotspot.topFilePath}
                                                    className="truncate"
                                                >
                                                    {topHotspot.topFilePath}
                                                </span>
                                            )}{" "}
                                            <span className="shrink-0 tabular-nums text-(--ink-muted)">
                                                {`(${formatNumber(topHotspot.topRiskScore, {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })})`}
                                            </span>
                                        </span>
                                    ) : null}
                                </td>
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
                    Connect a Git provider with commit history to surface bus-factor risk for this
                    view.
                </p>
            )}
        </Section>
    );
}

async function CodeQuadrantSection({ reads, filters }: Pick<SectionProps, "reads" | "filters">) {
    const { churnThroughput } = await resolveReads(reads, ["churnThroughput"]);
    return (
        <section>
            <QuadrantPanel
                title="Churn × Throughput landscape"
                description="Operating modes under change volume and delivery pace."
                data={churnThroughput}
                filters={filters}
                emptyState="Quadrant data unavailable for this scope."
            />
        </section>
    );
}

/** The page's evidence action lists facts from four reads: it draws when they all end. */
async function CodePageFactsAction({ reads, filters, activeRole }: SectionProps) {
    const data = await resolveReads(reads, ["home", "busFactor", "churnExplain", "repoHotspots"]);
    const { pageFacts } = derive(data, filters, activeRole);
    return <PageFactsEvidenceAction title="Code" facts={pageFacts} />;
}

export default async function CodePage({ searchParams }: CodePageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;

    const filters = filtersFromPageParams(encodedFilter, params, { view: "code" });
    const scopeId = filters.scope.ids[0] ?? "";
    const quadrantScope: "org" | "team" | "repo" | "developer" =
        filters.scope.level === "developer"
            ? "developer"
            : filters.scope.level === "team" || filters.scope.level === "repo"
              ? filters.scope.level
              : "org";

    // Every read starts now, in parallel with the health gate, and none is awaited here (CHAOS-9113):
    // the page waits for the health gate alone; each section waits for its own reads.
    const reads: CodeReads = {
        home: fetchOrNull(getHomeDataViaGraphQL(filters), "code/home-data"),
        churnExplain: fetchOrNull(
            getExplainData({ metric: "churn", filters }),
            "code/explain-churn",
        ),
        churnThroughput: fetchOrNull(
            getQuadrant({
                type: "churn_throughput",
                scope_type: quadrantScope,
                scope_id: scopeId,
                range_days: filters.time.range_days,
                bucket: "week",
                start_date: filters.time.start_date,
                end_date: filters.time.end_date,
                filters,
            }),
            "code/churn-throughput-quadrant",
        ),
        busFactor: fetchOrNull(getBusFactorData(filters), "code/bus-factor"),
        repoHotspots: fetchOrNull(getRepoTopHotspots(filters), "code/repo-top-hotspots"),
    };
    const health = await checkApiHealth();

    if (!health.ok) {
        return <ServiceUnavailable landmark={false} />;
    }

    const section = { reads, filters, activeRole };
    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader
                title="Churn and Ownership"
                subtitle="Hotspots and ownership concentration in the selected window."
                actions={
                    <Suspense fallback={null}>
                        <CodePageFactsAction {...section} />
                    </Suspense>
                }
            />

            <ScopeBar view="code" />

            <Suspense fallback={<SectionSkeleton height="h-28" />}>
                <CodeTilesSection {...section} />
            </Suspense>

            <Suspense fallback={<SectionSkeleton height="h-64" />}>
                <CodeTrendOwnershipSection {...section} />
            </Suspense>

            <Suspense fallback={<SectionSkeleton height="h-64" />}>
                <CodeRepoHotspotsSection {...section} />
            </Suspense>

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

            <Suspense fallback={<SectionSkeleton height="h-80" />}>
                <CodeQuadrantSection reads={reads} filters={filters} />
            </Suspense>
        </div>
    );
}
