import Link from "next/link";

import { QuadrantPanel } from "@/components/charts/QuadrantPanel";
import { ViewSet, type ViewSetItem } from "@/components/navigation/ViewSet";
import { getTabSet, tabHref, type TabIdOf } from "@/lib/navigation/tabs";
import {
    HotspotsView,
    OwnershipView,
    ReposView,
    TeamsView,
} from "@/components/landscape/LandscapeTabs";
import { Notice } from "@/components/ui/Notice";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import type { HotspotRow } from "@/components/complexity/ComplexityDashboard";
import { getQuadrant } from "@/lib/api/visuals";
import { getBusFactorData } from "@/lib/api/code";
import { checkApiHealth } from "@/lib/api/system";
import { requireSession } from "@/lib/auth";
import { CTA_LABELS } from "@/lib/design/cta";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { getLensFromSearchParams, getLandscapePrimaryType } from "@/lib/lensContext";
import { graphqlFetch } from "@/lib/graphql/server";
import { HOTSPOTS_QUERY } from "@/lib/graphql/queries";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { LANDSCAPE_EVIDENCE_METRICS } from "@/lib/metrics/landscape";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";

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

type LandscapeTab = TabIdOf<"landscape">;

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

export default async function LandscapePage({ searchParams }: LandscapePageProps) {
    const session = await requireSession();
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

    const lensParam = Array.isArray(params.lens) ? params.lens[0] : params.lens;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
    const landscapeTabs = getTabSet("landscape");
    const activeTab: LandscapeTab = landscapeTabs.tabs.some((tab) => tab.id === tabParam)
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
        return <ServiceUnavailable landmark={false} />;
    }

    const primaryCardIndex = QUADRANT_CARDS.findIndex((card) => card.type === landscapePrimaryType);
    const primaryCard =
        primaryCardIndex >= 0 ? QUADRANT_CARDS[primaryCardIndex] : QUADRANT_CARDS[0];
    const primaryData = quadrantData[primaryCardIndex >= 0 ? primaryCardIndex : 0];
    const otherCards = QUADRANT_CARDS.filter((card) => card.type !== primaryCard.type);
    const cycleIndex = QUADRANT_CARDS.findIndex((c) => c.type === "cycle_throughput");
    const churnIndex = QUADRANT_CARDS.findIndex((c) => c.type === "churn_throughput");

    const tabs: ViewSetItem[] = landscapeTabs.tabs.map((tab) => ({
        id: tab.id,
        label: tab.label,
        path: withFilterParam(tabHref(landscapeTabs, tab.id), filters, activeRole),
        navVisible: true,
    }));

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader
                title="Landscape"
                subtitle="Operating modes across paired pressures, teams, repos, ownership, and hotspots."
            />

            <ScopeBar view="landscape" />

            <ViewSet
                orientation="tabs"
                items={tabs}
                activeId={activeTab}
                overviewId="overview"
                ariaLabel="Landscape views"
            />

            {!canQuery && (
                <Notice variant="info" live={false} data-testid="landscape-individual-notice">
                    Individual landscapes are available from the individual view.
                </Notice>
            )}

            {activeTab === "overview" && (
                <>
                    <section
                        role="group"
                        aria-label="Bucket"
                        className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-(--ink-muted)"
                    >
                        <span>Bucket</span>
                        <Link
                            href={withFilterParam("/landscape?bucket=week", filters, activeRole)}
                            aria-current={bucket === "week" ? "true" : undefined}
                            className={`rounded-full border px-3 py-1 ${
                                bucket === "week"
                                    ? "border-(--accent) bg-(--accent)/15 text-foreground"
                                    : "border-(--card-stroke)"
                            }`}
                        >
                            {CTA_LABELS.week}
                        </Link>
                        <Link
                            href={withFilterParam("/landscape?bucket=month", filters, activeRole)}
                            aria-current={bucket === "month" ? "true" : undefined}
                            className={`rounded-full border px-3 py-1 ${
                                bucket === "month"
                                    ? "border-(--accent) bg-(--accent)/15 text-foreground"
                                    : "border-(--card-stroke)"
                            }`}
                        >
                            {CTA_LABELS.month}
                        </Link>
                    </section>

                    <section className="flex flex-col gap-8">
                        <div data-testid="landscape-primary-panel">
                            {/* NEW from the approved concept: a caption replaces the tinted frame. */}
                            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-(--ink-muted)">
                                Primary for this lens
                            </p>
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
                                            metric: LANDSCAPE_EVIDENCE_METRICS[primaryCard.type],
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
                                                    metric: LANDSCAPE_EVIDENCE_METRICS[card.type],
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
        </div>
    );
}
