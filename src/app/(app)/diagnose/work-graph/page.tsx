import { resolveActiveOrgId } from "@/lib/impersonation";
import { FilterBar } from "@/components/filters/FilterBar";
import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ViewSet, type ViewSetItem } from "@/components/navigation/ViewSet";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { BackLink } from "@/components/shared/BackLink";
import { GraphView, type WorkGraphTab } from "@/components/work/GraphView";
import { checkApiHealth } from "@/lib/api/system";
import { requireSession } from "@/lib/auth";
import { getServerEnv } from "@/lib/config";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import {
    getReviewEdgesViaGraphQL,
    type ReviewEdgesResult,
} from "@/lib/graphql/reviewEdgesFetchers";

type WorkGraphPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

/** Derive ISO date strings from a MetricFilter's time block (mirrors cognitive-load page). */
function dateRangeFromFilter(time: {
    range_days: number;
    start_date?: string;
    end_date?: string;
}): { sinceDate: string; untilDate: string } {
    if (time.start_date && time.end_date) {
        return { sinceDate: time.start_date, untilDate: time.end_date };
    }
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - (time.range_days - 1));
    const isoDate = (d: Date) => d.toISOString().slice(0, 10);
    return { sinceDate: isoDate(start), untilDate: isoDate(end) };
}

export default async function WorkGraphPage({ searchParams }: WorkGraphPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const originParam = Array.isArray(params.origin) ? params.origin[0] : params.origin;
    const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
    const evidenceParam = Array.isArray(params.evidence) ? params.evidence[0] : params.evidence;
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;
    const activeOrigin = typeof originParam === "string" ? originParam : undefined;
    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);
    const tabs: ViewSetItem[] = [
        {
            id: "overview",
            label: "Overview",
            path: withFilterParam("/diagnose/work-graph", filters, activeRole),
            navVisible: true,
        },
        {
            id: "dependencies",
            label: "Dependencies",
            path: withFilterParam("/diagnose/work-graph?tab=dependencies", filters, activeRole),
            navVisible: true,
        },
        {
            id: "inflow-outflow",
            label: "Inflow-Outflow",
            path: withFilterParam("/diagnose/work-graph?tab=inflow-outflow", filters, activeRole),
            navVisible: true,
        },
        {
            id: "review-network",
            label: "Review Network",
            path: withFilterParam("/diagnose/work-graph?tab=review-network", filters, activeRole),
            navVisible: true,
        },
        {
            id: "artifacts",
            label: "Artifacts",
            path: withFilterParam("/diagnose/work-graph?tab=artifacts", filters, activeRole),
            navVisible: true,
        },
    ];
    const activeTab =
        evidenceParam === "open"
            ? "artifacts"
            : typeof tabParam === "string" && tabs.some((tab) => tab.id === tabParam)
              ? tabParam
              : "overview";
    const env = getServerEnv();
    const isTestMode =
        env.DEV_HEALTH_TEST_MODE === "true" || env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";
    const health = await checkApiHealth();

    if (!health.ok && !isTestMode) {
        return <ServiceUnavailable />;
    }

    // ── Server-side review edges fetch (CHAOS-2077) ──────────────────────────
    // Only fetch when on the review-network tab to avoid unnecessary latency
    // on other tabs. The GraphView client component receives the pre-fetched
    // result as a prop and renders it without a client-side round-trip.
    const session = await requireSession();
    const orgId = resolveActiveOrgId(session.user) ?? "";
    const { sinceDate, untilDate } = dateRangeFromFilter(filters.time);
    const repoIds = filters.what?.repos?.length ? filters.what.repos : null;

    let reviewEdgesData: ReviewEdgesResult | null = null;
    let reviewEdgesError: string | null = null;

    if (orgId && activeTab === "review-network") {
        try {
            reviewEdgesData = await getReviewEdgesViaGraphQL({
                orgId,
                sinceDate,
                untilDate,
                repoIds,
            });
        } catch (err) {
            reviewEdgesError =
                err instanceof Error ? err.message : "Failed to load review network data";
        }
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <PrimaryNav filters={filters} active="diagnose" role={activeRole} />
                <main className="flex min-w-0 flex-1 flex-col gap-8">
                    <header className="flex flex-col gap-4">
                        <BackLink
                            href={withFilterParam("/diagnose", filters, activeRole)}
                            area="Diagnose"
                        />
                        <div>
                            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                                Diagnose
                            </p>
                            <h1 className="mt-2 font-(--font-display) text-3xl">Work Graph</h1>
                            <p className="mt-2 text-sm text-(--ink-muted)">
                                Relationship topology across work, pull requests, code, releases,
                                incidents, and evidence-bearing artifacts.
                            </p>
                        </div>
                    </header>

                    <GlobalContextBar filters={filters} origin={activeOrigin} />
                    <FilterBar view="work" />
                    <ViewSet
                        orientation="tabs"
                        items={tabs}
                        activeId={activeTab}
                        overviewId="overview"
                        ariaLabel="Work Graph views"
                    />
                    <GraphView
                        filters={filters}
                        activeRole={activeRole}
                        activeTab={activeTab as WorkGraphTab}
                        reviewEdges={reviewEdgesData?.edges ?? null}
                        reviewEdgesLoading={false}
                        reviewEdgesError={reviewEdgesError}
                    />
                </main>
            </div>
        </div>
    );
}
