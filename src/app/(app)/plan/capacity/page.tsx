import { UpgradeGate } from "@/components/billing/UpgradeGate";
import { FilterBar } from "@/components/filters/FilterBar";
import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { BackLink } from "@/components/shared/BackLink";
import { CapacityView } from "@/components/work/CapacityView";
import { getCurrentOrg, getOrgEntitlements } from "@/lib/admin/server";
import { checkApiHealth } from "@/lib/api/system";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { getCapacityForecastForHydration } from "@/lib/graphql/capacityHydration";
import { HydrateUrqlResults } from "@/lib/graphql/HydrateUrqlResults";
import { runtimeConfig } from "@/lib/runtimeConfig";

type PlanCapacityPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function PlanCapacityPage({ searchParams }: PlanCapacityPageProps) {
    // Run health check, org fetch, and entitlements fetch as concurrently as possible.
    const orgPromise = fetchOrNull(getCurrentOrg(), "plan/capacity/org");
    const entitlementsPromise = orgPromise.then((orgResult) => {
        const orgId = orgResult?.data?.id;
        return orgId ? fetchOrNull(getOrgEntitlements(orgId), "plan/capacity/entitlements") : null;
    });

    const [health, , entitlements] = await Promise.all([
        checkApiHealth(),
        orgPromise,
        entitlementsPromise,
    ]);

    if (!health.ok) {
        return <ServiceUnavailable />;
    }

    const features = entitlements?.data?.features ?? {};
    const currentTier = entitlements?.data?.tier;

    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const originParam = Array.isArray(params.origin) ? params.origin[0] : params.origin;
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;
    const activeOrigin = typeof originParam === "string" ? originParam : undefined;

    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

    const graphqlEnabled = runtimeConfig["useGraphQLAnalytics"]();
    let hydrationOrgId: string | undefined;
    if (graphqlEnabled) {
        const { auth } = await import("@/lib/auth");
        const session = await auth();
        hydrationOrgId = session?.user?.org_id as string | undefined;
    }

    const capacityResult =
        graphqlEnabled && hydrationOrgId
            ? await fetchOrNull(
                  getCapacityForecastForHydration(filters, hydrationOrgId),
                  "plan/capacity/forecast-hydration",
              )
            : null;

    const capacityHydrationPayload = capacityResult?.hydrationPayload ?? null;

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <PrimaryNav filters={filters} active="capacity" role={activeRole} />
                <main className="flex min-w-0 flex-1 flex-col gap-8">
                    <header className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                                Capacity Forecast
                            </p>
                            <h1 className="mt-2 font-(--font-display) text-3xl">
                                Capacity Forecast
                            </h1>
                            <p className="mt-2 text-sm text-(--ink-muted)">
                                Monte Carlo is the method behind this completion projection,
                                throughput distribution, and confidence bands. Adjust the date range
                                to control how much history informs the forecast.
                            </p>
                        </div>
                        <BackLink href={withFilterParam("/plan", filters, activeRole)} />
                    </header>

                    <GlobalContextBar filters={filters} origin={activeOrigin} />
                    <FilterBar view="capacity-planning" />

                    <UpgradeGate
                        feature="capacity_forecast"
                        requiredTier="team"
                        currentTier={currentTier}
                        features={features}
                    >
                        <HydrateUrqlResults payload={capacityHydrationPayload} />
                        <CapacityView filters={filters} orgId={hydrationOrgId} />
                    </UpgradeGate>
                </main>
            </div>
        </div>
    );
}
