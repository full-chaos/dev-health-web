import type { ReactNode } from "react";
import Link from "next/link";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { QuadrantPanel } from "@/components/charts/QuadrantPanel";
import { FilterBar } from "@/components/filters/FilterBar";
import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ViewSet, type ViewSetItem } from "@/components/navigation/ViewSet";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { BackLink } from "@/components/shared/BackLink";
import { DataState } from "@/components/ui/DataState";
import type { HotspotRow } from "@/components/complexity/ComplexityDashboard";
import { getQuadrant } from "@/lib/api/visuals";
import { getBusFactorData } from "@/lib/api/code";
import { checkApiHealth } from "@/lib/api/system";
import { requireSession } from "@/lib/auth";
import { CTA_LABELS } from "@/lib/design/cta";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { getLensFromSearchParams, getLandscapePrimaryType } from "@/lib/lensContext";
import { formatNumber } from "@/lib/formatters";
import { graphqlFetch } from "@/lib/graphql/server";
import { HOTSPOTS_QUERY } from "@/lib/graphql/queries";
import type { BusFactor } from "@/lib/graphql/types";
import type { QuadrantResponse } from "@/lib/types";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { LANDSCAPE_EVIDENCE_METRICS } from "@/lib/metrics/landscape";
import { navTrailForPathname } from "@/lib/navigation/areas";

const QUADRANT_CARDS = [
    {
        type: "cycle_throughput" as const,
        title: "Cycle Time × Throughput",
        description: "Operating modes under time in flight and delivery pace.",
    },
    {
        type: "churn_throughput" as const,
        title: "Churn × Throughput",
        description: "Operating modes under change volume and delivery pace.",
    },
];

const LANDSCAPE_TABS = ["overview", "teams", "repos", "ownership", "hotspots"] as const;
type LandscapeTab = (typeof LANDSCAPE_TABS)[number];

type LandscapePageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

const scopeTypeMap: Record<string, "org" | "team" | "repo" | "person"> = {
    org: "org",
    team: "team",
    repo: "repo",
    developer: "person",
    person: "person",
};

async function fetchHotspots(
    orgId: string,
    sinceUtc: string,
    untilUtc: string,
): Promise<HotspotRow[]> {
    try {
        const data = await graphqlFetch<{ hotspots: { rows: HotspotRow[] } }>(
            HOTSPOTS_QUERY,
            { input: { orgId, sinceUtc, untilUtc, limit: 100 } },
            { orgId },
        );
        return data.hotspots?.rows ?? [];
    } catch (err) {
        console.warn("landscape hotspots query failed", err);
        return [];
    }
}

// ── Shared table shell (server-rendered) ────────────────────────────────────

function LandscapeTable({
    columns,
    rows,
    testId,
    empty,
}: {
    columns: { label: string; align?: "left" | "right" }[];
    rows: ReactNode[];
    testId: string;
    empty: { title: string; description: string };
}) {
    if (rows.length === 0) {
        return (
            <DataState
                variant="detector-enabled-no-findings"
                title={empty.title}
                description={empty.description}
            />
        );
    }
    return (
        <div className="overflow-hidden rounded-2xl border border-(--card-stroke) bg-(--card-90) shadow-sm">
            <table className="w-full text-sm" data-testid={testId}>
                <thead className="bg-(--card-60) text-xs font-semibold uppercase tracking-[0.18em] text-(--ink-muted)">
                    <tr>
                        {columns.map((col) => (
                            <th
                                key={col.label}
                                className={`px-5 py-3 ${col.align === "right" ? "text-right" : "text-left"}`}
                            >
                                {col.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>{rows}</tbody>
            </table>
        </div>
    );
}

function TabPanel({
    title,
    description,
    children,
    testId,
}: {
    title: string;
    description: string;
    children: ReactNode;
    testId: string;
}) {
    return (
        <section
            className="rounded-[1.75rem] border border-(--card-stroke) bg-(--card-90) p-6 shadow-sm"
            data-testid={testId}
        >
            <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
                <p className="mt-1 text-sm text-(--ink-muted)">{description}</p>
            </div>
            {children}
        </section>
    );
}

// ── Teams tab — derived from the two quadrant point sets ────────────────────

function TeamsView({
    cycleData,
    churnData,
}: {
    cycleData: QuadrantResponse | null;
    churnData: QuadrantResponse | null;
}) {
    const churnById = new Map((churnData?.points ?? []).map((p) => [p.entity_id, p.x]));
    const rows = (cycleData?.points ?? [])
        .map((p) => ({
            id: p.entity_id,
            label: p.entity_label,
            cycle: p.x,
            throughput: p.y,
            churn: churnById.get(p.entity_id),
        }))
        .sort((a, b) => b.throughput - a.throughput);

    return (
        <TabPanel
            title="Teams"
            description="Delivery pace and pressure per team — throughput against cycle time and change volume."
            testId="landscape-teams"
        >
            <LandscapeTable
                testId="teams-table"
                empty={{
                    title: "No team data",
                    description:
                        "Team operating-mode data is not available for this scope and window.",
                }}
                columns={[
                    { label: "Team" },
                    { label: "Throughput (items)", align: "right" },
                    { label: "Cycle time (days)", align: "right" },
                    { label: "Churn (loc)", align: "right" },
                ]}
                rows={rows.map((r) => (
                    <tr
                        key={r.id}
                        data-testid="teams-row"
                        className="border-t border-(--card-stroke)/60"
                    >
                        <td className="px-5 py-3 align-middle font-medium">{r.label}</td>
                        <td className="px-5 py-3 text-right tabular-nums">
                            {formatNumber(r.throughput, { maximumFractionDigits: 1 })}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">
                            {formatNumber(r.cycle, { maximumFractionDigits: 1 })}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">
                            {r.churn === undefined
                                ? "—"
                                : formatNumber(r.churn, { maximumFractionDigits: 0 })}
                        </td>
                    </tr>
                ))}
            />
        </TabPanel>
    );
}

// ── Repos tab — hotspots aggregated by repository ───────────────────────────

function ReposView({ hotspots }: { hotspots: HotspotRow[] }) {
    const byRepo = new Map<
        string,
        { repoName: string; files: number; churn: number; riskSum: number }
    >();
    for (const row of hotspots) {
        const entry = byRepo.get(row.repoId) ?? {
            repoName: row.repoName,
            files: 0,
            churn: 0,
            riskSum: 0,
        };
        entry.files += 1;
        entry.churn += row.churnLoc30d;
        entry.riskSum += row.riskScore;
        byRepo.set(row.repoId, entry);
    }
    const rows = Array.from(byRepo.values())
        .map((r) => ({ ...r, avgRisk: r.files ? r.riskSum / r.files : 0 }))
        .sort((a, b) => b.churn - a.churn);

    return (
        <TabPanel
            title="Repos"
            description="Repository activity and risk — change volume and average hotspot risk across tracked files."
            testId="landscape-repos"
        >
            <LandscapeTable
                testId="repos-table"
                empty={{
                    title: "No repository data",
                    description:
                        "Repository hotspot data is not available for this scope and window.",
                }}
                columns={[
                    { label: "Repo" },
                    { label: "Hotspot files", align: "right" },
                    { label: "Churn LOC 30d", align: "right" },
                    { label: "Avg risk", align: "right" },
                ]}
                rows={rows.map((r) => (
                    <tr
                        key={r.repoName}
                        data-testid="repos-row"
                        className="border-t border-(--card-stroke)/60"
                    >
                        <td className="px-5 py-3 align-middle font-medium">{r.repoName}</td>
                        <td className="px-5 py-3 text-right tabular-nums">
                            {formatNumber(r.files)}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">
                            {formatNumber(r.churn)}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">
                            {formatNumber(r.avgRisk, { maximumFractionDigits: 3 })}
                        </td>
                    </tr>
                ))}
            />
        </TabPanel>
    );
}

// ── Ownership tab — bus factor per repository ───────────────────────────────

function OwnershipView({ busFactor }: { busFactor: BusFactor | null }) {
    const rows = [...(busFactor?.repos ?? [])].sort((a, b) => a.value - b.value);

    return (
        <TabPanel
            title="Ownership risk"
            description="Bus factor per repository — how many maintainers carry each repo. Lower means more single-owner risk."
            testId="landscape-ownership"
        >
            <LandscapeTable
                testId="ownership-table"
                empty={{
                    title: "No ownership data",
                    description:
                        "Bus-factor data needs commit-author history for this scope and window.",
                }}
                columns={[
                    { label: "Repo" },
                    { label: "Bus factor", align: "right" },
                    { label: "Top maintainer" },
                    { label: "Share", align: "right" },
                ]}
                rows={rows.map((r) => {
                    const top = r.topMaintainers[0];
                    return (
                        <tr
                            key={r.repoId}
                            data-testid="ownership-row"
                            className="border-t border-(--card-stroke)/60"
                        >
                            <td className="px-5 py-3 align-middle font-medium">{r.repoName}</td>
                            <td className="px-5 py-3 text-right tabular-nums">
                                {formatNumber(r.value, { maximumFractionDigits: 1 })}
                            </td>
                            <td className="px-5 py-3 align-middle text-(--ink-muted)">
                                {top ? top.author : "—"}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums">
                                {top ? `${Math.round(top.sharePercent)}%` : "—"}
                            </td>
                        </tr>
                    );
                })}
            />
        </TabPanel>
    );
}

// ── Hotspots tab — file-level risk ──────────────────────────────────────────

function HotspotsView({ hotspots }: { hotspots: HotspotRow[] }) {
    const rows = [...hotspots].sort((a, b) => b.riskScore - a.riskScore).slice(0, 25);

    return (
        <TabPanel
            title="Hotspots"
            description="Files carrying the most risk — churn × complexity × ownership concentration."
            testId="landscape-hotspots"
        >
            <LandscapeTable
                testId="hotspots-table"
                empty={{
                    title: "No hotspot files",
                    description: "No files crossed the hotspot risk threshold in this window.",
                }}
                columns={[
                    { label: "File" },
                    { label: "Repo" },
                    { label: "Risk score", align: "right" },
                    { label: "Churn LOC 30d", align: "right" },
                ]}
                rows={rows.map((r) => {
                    const fileName = r.filePath.split("/").pop() ?? r.filePath;
                    return (
                        <tr
                            key={`${r.repoId}-${r.filePath}`}
                            data-testid="hotspots-row"
                            className="border-t border-(--card-stroke)/60"
                        >
                            <td
                                className="px-5 py-3 align-middle font-mono text-[0.82em]"
                                title={r.filePath}
                            >
                                {fileName}
                            </td>
                            <td className="px-5 py-3 align-middle text-(--ink-muted)">
                                {r.repoName}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums">
                                {formatNumber(r.riskScore, { maximumFractionDigits: 3 })}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums">
                                {formatNumber(r.churnLoc30d)}
                            </td>
                        </tr>
                    );
                })}
            />
        </TabPanel>
    );
}

export default async function LandscapePage({ searchParams }: LandscapePageProps) {
    const session = await requireSession();
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

    const lensParam = Array.isArray(params.lens) ? params.lens[0] : params.lens;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
    const activeTab: LandscapeTab = LANDSCAPE_TABS.includes(tabParam as LandscapeTab)
        ? (tabParam as LandscapeTab)
        : "overview";
    const activeLensId =
        getLensFromSearchParams(
            new URLSearchParams({
                ...(lensParam ? { lens: lensParam } : {}),
                ...(roleParam ? { role: roleParam } : {}),
            }),
        ) ?? "neutral";
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;
    const landscapePrimaryType = getLandscapePrimaryType(activeLensId);

    const bucketParam = Array.isArray(params.bucket) ? params.bucket[0] : params.bucket;
    const bucket = bucketParam === "month" ? "month" : "week";

    const scopeType = scopeTypeMap[filters.scope.level] ?? "org";
    const scopeId = filters.scope.ids[0] ?? "";
    const canQuery = scopeType !== "person" || Boolean(scopeId);
    const orgId = session.user?.org_id ?? scopeId;

    const until = new Date();
    const since = new Date(until);
    since.setDate(since.getDate() - (filters.time.range_days ?? 90));

    const quadrantPromises = canQuery
        ? QUADRANT_CARDS.map((card) =>
              fetchOrNull(
                  getQuadrant({
                      type: card.type,
                      scope_type: scopeType,
                      scope_id: scopeId,
                      range_days: filters.time.range_days,
                      start_date: filters.time.start_date,
                      end_date: filters.time.end_date,
                      bucket,
                  }),
                  `landscape/quadrant-${card.type}`,
              ),
          )
        : QUADRANT_CARDS.map(() => Promise.resolve(null));

    const [health, hotspots, busFactor, ...quadrantData] = await Promise.all([
        checkApiHealth(),
        orgId
            ? fetchHotspots(orgId, since.toISOString(), until.toISOString())
            : Promise.resolve([]),
        fetchOrNull(getBusFactorData(filters), "landscape/bus-factor"),
        ...quadrantPromises,
    ]);

    if (!health.ok) {
        return <ServiceUnavailable />;
    }

    const primaryCardIndex = QUADRANT_CARDS.findIndex((card) => card.type === landscapePrimaryType);
    const primaryCard =
        primaryCardIndex >= 0 ? QUADRANT_CARDS[primaryCardIndex] : QUADRANT_CARDS[0];
    const primaryData = quadrantData[primaryCardIndex >= 0 ? primaryCardIndex : 0];
    const otherCards = QUADRANT_CARDS.filter((card) => card.type !== primaryCard.type);
    const cycleIndex = QUADRANT_CARDS.findIndex((c) => c.type === "cycle_throughput");
    const churnIndex = QUADRANT_CARDS.findIndex((c) => c.type === "churn_throughput");

    const tabs: ViewSetItem[] = LANDSCAPE_TABS.map((id) => ({
        id,
        label: id === "overview" ? "Overview" : id[0].toUpperCase() + id.slice(1),
        path: withFilterParam(
            id === "overview" ? "/landscape" : `/landscape?tab=${id}`,
            filters,
            activeRole,
        ),
        navVisible: true,
    }));

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <PrimaryNav filters={filters} active="landscape" role={activeRole} />
                <main className="flex min-w-0 flex-1 flex-col gap-8">
                    <header className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <Breadcrumbs items={navTrailForPathname("/landscape")} />
                            <p className="mt-4 text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                                Diagnose
                            </p>
                            <h1 className="mt-2 font-(--font-display) text-3xl">Landscape</h1>
                            <p className="mt-2 text-sm text-(--ink-muted)">
                                Operating modes across paired pressures, teams, repos, ownership,
                                and hotspots.
                            </p>
                        </div>
                        <BackLink
                            href={withFilterParam("/diagnose", filters, activeRole)}
                            area="Diagnose"
                        />
                    </header>

                    <GlobalContextBar filters={filters} />
                    <FilterBar condensed view="landscape" />

                    <ViewSet
                        orientation="tabs"
                        items={tabs}
                        activeId={activeTab}
                        overviewId="overview"
                        ariaLabel="Landscape views"
                    />

                    {!canQuery && (
                        <section className="rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-70) p-5 text-sm text-(--ink-muted)">
                            Individual landscapes are available from the individual view.
                        </section>
                    )}

                    {activeTab === "overview" && (
                        <>
                            <section className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                <span>Bucket</span>
                                <Link
                                    href={withFilterParam(
                                        "/landscape?bucket=week",
                                        filters,
                                        activeRole,
                                    )}
                                    className={`rounded-full border px-3 py-1 ${
                                        bucket === "week"
                                            ? "border-(--accent) bg-(--accent)/15 text-foreground"
                                            : "border-(--card-stroke)"
                                    }`}
                                >
                                    {CTA_LABELS.week}
                                </Link>
                                <Link
                                    href={withFilterParam(
                                        "/landscape?bucket=month",
                                        filters,
                                        activeRole,
                                    )}
                                    className={`rounded-full border px-3 py-1 ${
                                        bucket === "month"
                                            ? "border-(--accent) bg-(--accent)/15 text-foreground"
                                            : "border-(--card-stroke)"
                                    }`}
                                >
                                    {CTA_LABELS.month}
                                </Link>
                            </section>

                            <section className="flex flex-col gap-10">
                                <div className="rounded-3xl border border-(--accent-2)/30 bg-(--accent-2)/5 p-6 sm:p-8">
                                    <QuadrantPanel
                                        key={primaryCard.type}
                                        title={primaryCard.title}
                                        description={primaryCard.description}
                                        data={primaryData}
                                        filters={filters}
                                        chartHeight={420}
                                        emptyState="Quadrant data unavailable for this scope."
                                        relatedLinks={[
                                            {
                                                label: CTA_LABELS.openEvidence,
                                                href: buildExploreUrl({
                                                    metric: LANDSCAPE_EVIDENCE_METRICS[
                                                        primaryCard.type
                                                    ],
                                                    filters,
                                                    role: activeRole,
                                                }),
                                            },
                                        ]}
                                    />
                                </div>
                                <div className="flex flex-col gap-8">
                                    {otherCards.map((card) => {
                                        const cardIndex = QUADRANT_CARDS.findIndex(
                                            (item) => item.type === card.type,
                                        );
                                        return (
                                            <QuadrantPanel
                                                key={card.type}
                                                title={card.title}
                                                description={card.description}
                                                data={quadrantData[cardIndex]}
                                                filters={filters}
                                                chartHeight={320}
                                                emptyState="Quadrant data unavailable for this scope."
                                                relatedLinks={[
                                                    {
                                                        label: CTA_LABELS.openEvidence,
                                                        href: buildExploreUrl({
                                                            metric: LANDSCAPE_EVIDENCE_METRICS[
                                                                card.type
                                                            ],
                                                            filters,
                                                            role: activeRole,
                                                        }),
                                                    },
                                                ]}
                                            />
                                        );
                                    })}
                                </div>
                            </section>
                        </>
                    )}

                    {activeTab === "teams" && (
                        <TeamsView
                            cycleData={cycleIndex >= 0 ? quadrantData[cycleIndex] : null}
                            churnData={churnIndex >= 0 ? quadrantData[churnIndex] : null}
                        />
                    )}
                    {activeTab === "repos" && <ReposView hotspots={hotspots} />}
                    {activeTab === "ownership" && <OwnershipView busFactor={busFactor} />}
                    {activeTab === "hotspots" && <HotspotsView hotspots={hotspots} />}
                </main>
            </div>
        </div>
    );
}
