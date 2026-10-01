import Link from "next/link";

import { UpgradeGate } from "@/components/billing/UpgradeGate";
import { ViewSet, type ViewSetItem } from "@/components/navigation/ViewSet";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { getCurrentOrg, getOrgEntitlements } from "@/lib/admin/server";
import { CTA_LABELS } from "@/lib/design/cta";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { InvestmentGatedBody } from "./_components/InvestmentGatedBody";
import { INVESTMENT_TABS, type InvestmentTab } from "@/components/work/investment/types";
import { getHomeDataViaGraphQL } from "@/lib/graphql/homeFetchers";
import { FALLBACK_DELTAS } from "@/lib/metrics/catalog";
import type { MetricDelta } from "@/lib/types";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";

const getMetric = (deltas: MetricDelta[], metric: string) =>
    deltas.find((item) => item.metric === metric) ??
    FALLBACK_DELTAS.find((item) => item.metric === metric);

const INVESTMENT_TAB_LABELS: Record<InvestmentTab, string> = {
    overview: "Overview",
    allocation: "Allocation",
    evidence: "Evidence",
    confidence: "Confidence",
};

type InvestmentPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function InvestmentPage({ searchParams }: InvestmentPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const originParam = Array.isArray(params.origin) ? params.origin[0] : params.origin;
    const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;
    const activeOrigin = typeof originParam === "string" ? originParam : undefined;
    const activeTab: InvestmentTab = INVESTMENT_TABS.includes(tabParam as InvestmentTab)
        ? (tabParam as InvestmentTab)
        : "overview";

    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

    const [health, orgResult, home] = await Promise.all([
        checkApiHealth(),
        getCurrentOrg().catch(() => ({ data: undefined })),
        fetchOrNull(getHomeDataViaGraphQL(filters), "investment/home-data"),
    ]);

    if (!health.ok) {
        return <ServiceUnavailable landmark={false} />;
    }

    const org = orgResult.data;
    const entitlements = org?.id
        ? await fetchOrNull(getOrgEntitlements(org.id), "investment/entitlements")
        : null;
    const features = entitlements?.data?.features ?? {};
    // Mirror UpgradeGate's gate decision so the data-fetching subtree
    // (InvestmentView + its hooks) mounts ONLY when the org is entitled.
    const investmentEnabled = features["investment_view"] === true;

    const reworkMetric = getMetric(home?.deltas ?? [], "pr_rework_ratio");
    const reworkThemeAllocation = home?.rework_theme_allocation ?? [];

    const tabs: ViewSetItem[] = INVESTMENT_TABS.map((id) => ({
        id,
        label: INVESTMENT_TAB_LABELS[id],
        path: withFilterParam(
            id === "overview" ? "/investment" : `/investment?tab=${id}`,
            filters,
            activeRole,
            activeOrigin,
        ),
        navVisible: true,
    }));

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <UpgradeGate feature="investment_view" requiredTier="team" features={features}>
                <PageHeader
                    title="Investment"
                    subtitle="Effort and attention allocation over the selected window."
                    actions={
                        <Link
                            href={buildExploreUrl({
                                metric: "throughput",
                                filters,
                                role: activeRole,
                                origin: activeOrigin,
                            })}
                            className="rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em]"
                        >
                            {CTA_LABELS.inspectAssociations}
                        </Link>
                    }
                >
                    <p className="text-sm text-(--ink-muted)">Select a segment to investigate.</p>
                </PageHeader>

                <ScopeBar view="investment" origin={activeOrigin} />

                <div className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-3 text-xs leading-relaxed text-(--ink-muted)">
                    <span className="text-foreground font-semibold uppercase tracking-wider">
                        Perspective:
                    </span>{" "}
                    Investment reflects effort and attention (not spend). Allocation paths move
                    left-to-right (Allocation &rarr; Streams &rarr; Items).
                </div>

                <ViewSet
                    orientation="tabs"
                    items={tabs}
                    activeId={activeTab}
                    overviewId="overview"
                    ariaLabel="Investment views"
                />

                <InvestmentGatedBody
                    enabled={investmentEnabled}
                    filters={filters}
                    activeRole={activeRole}
                    activeTab={activeTab}
                    reworkMetric={reworkMetric}
                    reworkThemeAllocation={reworkThemeAllocation}
                />
            </UpgradeGate>
        </div>
    );
}
