import { ViewSet } from "@/components/navigation/ViewSet";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { GraphView, type WorkGraphTab } from "@/components/work/GraphView";
import { WorkGraphHeaderActions } from "@/components/work/WorkGraphHeaderActions";
import { buildWorkGraphTabs } from "./buildTabs";
import { checkApiHealth } from "@/lib/api/system";
import { requireSession } from "@/lib/auth";
import { getServerEnv } from "@/lib/config";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import {
    getReviewEdgesViaGraphQL,
    type ReviewEdgesResult,
} from "@/lib/graphql/reviewEdgesFetchers";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";

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

    const graphThemeParam = Array.isArray(params.graph_theme)
        ? params.graph_theme[0]
        : params.graph_theme;
    const graphSubcategoryParam = Array.isArray(params.graph_subcategory)
        ? params.graph_subcategory[0]
        : params.graph_subcategory;
    const tabs = buildWorkGraphTabs({
        filters,
        activeRole,
        graphTheme: typeof graphThemeParam === "string" ? graphThemeParam : undefined,
        graphSubcategory:
            typeof graphSubcategoryParam === "string" ? graphSubcategoryParam : undefined,
    });
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
        return <ServiceUnavailable landmark={false} />;
    }

    // ── Server-side review edges fetch (CHAOS-2077) ──────────────────────────
    // Only fetch when on the review-network tab to avoid unnecessary latency
    // on other tabs. The GraphView client component receives the pre-fetched
    // result as a prop and renders it without a client-side round-trip.
    const session = await requireSession();
    const orgId = session.user.org_id ?? "";
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
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader
                title="Work Graph"
                subtitle="Relationship topology across work, pull requests, code, releases, incidents, and evidence-bearing artifacts."
                actions={
                    <WorkGraphHeaderActions
                        filters={filters}
                        activeTab={activeTab}
                        role={activeRole}
                        origin={activeOrigin}
                    />
                }
            />

            <ScopeBar view="work" origin={activeOrigin} />
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
        </div>
    );
}
