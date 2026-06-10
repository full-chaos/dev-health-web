import Link from "next/link";
import { BackLink } from "@/components/shared/BackLink";

import { UpgradeGate } from "@/components/billing/UpgradeGate";
import { FilterBar } from "@/components/filters/FilterBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ViewSet, type ViewSetItem } from "@/components/navigation/ViewSet";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { getCurrentOrg, getOrgEntitlements } from "@/lib/admin/server";
import { CTA_LABELS } from "@/lib/design/cta";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { InvestmentView } from "@/components/work/InvestmentView";
import { INVESTMENT_TABS, type InvestmentTab } from "@/components/work/investment/types";
import { getHomeData } from "@/lib/api/home";
import { FALLBACK_DELTAS } from "@/lib/metrics/catalog";
import type { MetricDelta } from "@/lib/types";

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
        fetchOrNull(getHomeData(filters), "investment/home-data"),
    ]);

    if (!health.ok) {
        return <ServiceUnavailable />;
    }

    const org = orgResult.data;
    const entitlements = org?.id
        ? await fetchOrNull(getOrgEntitlements(org.id), "investment/entitlements")
        : null;
    const features = entitlements?.data?.features ?? {};

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
        <div className="min-h-screen bg-background text-foreground">
            <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <PrimaryNav filters={filters} active="investment" role={activeRole} />
                <main className="flex min-w-0 flex-1 flex-col gap-8">
                    <UpgradeGate feature="investment_view" requiredTier="team" features={features}>
                        <header className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                                <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                                    Diagnose
                                </p>
                                <h1 className="mt-2 font-(--font-display) text-3xl">Investment</h1>
                                <p className="mt-2 text-sm text-(--ink-muted)">
                                    Effort and attention allocation over the selected window.
                                </p>
                                <p className="mt-2 text-sm text-(--ink-muted)">
                                    Select a segment to investigate.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.2em]">
                                <Link
                                    href={buildExploreUrl({
                                        metric: "throughput",
                                        filters,
                                        role: activeRole,
                                        origin: activeOrigin,
                                    })}
                                    className="rounded-full border border-(--border) px-4 py-2"
                                >
                                    {CTA_LABELS.inspectAssociations}
                                </Link>
                                <BackLink
                                    href={withFilterParam(
                                        "/diagnose",
                                        filters,
                                        activeRole,
                                        activeOrigin,
                                    )}
                                    area="Diagnose"
                                />
                            </div>
                        </header>

                        <FilterBar view="investment" />

                        <div className="rounded-2xl border border-(--border) bg-(--card-80) p-3 text-xs leading-relaxed text-(--ink-muted)">
                            <span className="text-foreground font-semibold uppercase tracking-wider">
                                Perspective:
                            </span>{" "}
                            Investment reflects effort and attention (not spend). Allocation paths
                            move left-to-right (Allocation &rarr; Streams &rarr; Items).
                        </div>

                        <GlobalContextBar filters={filters} origin={activeOrigin} />

                        <ViewSet
                            orientation="tabs"
                            items={tabs}
                            activeId={activeTab}
                            overviewId="overview"
                            ariaLabel="Investment views"
                        />

                        <InvestmentView
                            filters={filters}
                            activeRole={activeRole}
                            activeTab={activeTab}
                            reworkMetric={reworkMetric}
                            reworkThemeAllocation={reworkThemeAllocation}
                        />
                    </UpgradeGate>
                </main>
            </div>
        </div>
    );
}
