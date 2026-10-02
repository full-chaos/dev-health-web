import { UpgradeGate } from "@/components/billing/UpgradeGate";
import { ViewSet, type ViewSetItem } from "@/components/navigation/ViewSet";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { getCurrentOrg, getOrgEntitlements } from "@/lib/admin/server";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { InvestmentGatedBody } from "./_components/InvestmentGatedBody";
import type { InvestmentTab } from "@/components/work/investment/types";
import { getTabSet, tabHref } from "@/lib/navigation/tabs";
import { getHomeDataViaGraphQL } from "@/lib/graphql/homeFetchers";
import { FALLBACK_DELTAS } from "@/lib/metrics/catalog";
import type { MetricDelta } from "@/lib/types";
import { PageHeader } from "@/components/shell/PageHeader";
import { PageHeaderEvidenceAction } from "@/components/shell/PageHeaderEvidenceAction";
import { Notice } from "@/components/ui/Notice";
import { ScopeBar } from "@/components/shell/ScopeBar";

const getMetric = (deltas: MetricDelta[], metric: string) =>
    deltas.find((item) => item.metric === metric) ??
    FALLBACK_DELTAS.find((item) => item.metric === metric);

/** The page subtitle of each tab (approved prototype, views 5 to 10). */
const TAB_SUBTITLE: Record<InvestmentTab, string> = {
    overview: "Effort and attention allocation over the selected window.",
    allocation: "How effort is distributed across teams, repositories, and themes.",
    evidence: "The work units behind the investment mix.",
    confidence: "Classification confidence, evidence quality, attribution coverage, and rework.",
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
    const investmentTabs = getTabSet("investment");
    const activeTab: InvestmentTab = investmentTabs.tabs.some((tab) => tab.id === tabParam)
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

    const tabs: ViewSetItem[] = investmentTabs.tabs.map((tab) => ({
        id: tab.id,
        label: tab.label,
        path: withFilterParam(tabHref(investmentTabs, tab.id), filters, activeRole, activeOrigin),
        navVisible: true,
    }));

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <UpgradeGate feature="investment_view" requiredTier="team" features={features}>
                <PageHeader
                    title="Investment"
                    subtitle={TAB_SUBTITLE[activeTab]}
                    actions={
                        // The page subject is the throughput metric, as the header's former
                        // "Inspect associations" link was: the drawer shows its associations and
                        // its footer links to the same evidence page.
                        <PageHeaderEvidenceAction
                            subject={{
                                title: "Throughput",
                                metric: "throughput",
                                filters,
                                role: activeRole,
                            }}
                        />
                    }
                />

                <ScopeBar view="investment" origin={activeOrigin} />

                <ViewSet
                    orientation="tabs"
                    items={tabs}
                    activeId={activeTab}
                    overviewId="overview"
                    ariaLabel="Investment views"
                />

                {/* Static guidance, not a status update: no live region. */}
                <Notice variant="info" live={false} data-testid="investment-perspective">
                    <strong className="font-semibold text-foreground">
                        Investment reflects effort and attention—not spend.
                    </strong>{" "}
                    Allocation paths move from allocation to streams to items.
                </Notice>

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
