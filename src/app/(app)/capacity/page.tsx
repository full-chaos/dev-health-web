import { BackLink } from "@/components/shared/BackLink";

import { UpgradeGate } from "@/components/billing/UpgradeGate";
import { FilterBar } from "@/components/filters/FilterBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { CapacityView } from "@/components/work/CapacityView";
import { checkApiHealth } from "@/lib/api/system";
import { getCurrentOrg, getOrgEntitlements } from "@/lib/admin/server";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { getCapacityForecastForHydration } from "@/lib/graphql/capacityHydration";
import { HydrateUrqlResults } from "@/lib/graphql/HydrateUrqlResults";
import { ContextStrip } from "@/components/navigation/ContextStrip";
import { runtimeConfig } from "@/lib/runtimeConfig";

type CapacityPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function CapacityPage({ searchParams }: CapacityPageProps) {
    // Run health check, org fetch, and entitlements fetch as concurrently as possible.
    const orgPromise = fetchOrNull(getCurrentOrg(), "capacity/org");
    const entitlementsPromise = orgPromise.then((orgResult) => {
        const orgId = orgResult?.data?.id;

        return orgId ? fetchOrNull(getOrgEntitlements(orgId), "capacity/entitlements") : null;
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
                  "capacity/forecast-hydration",
              )
            : null;

    const capacityHydrationPayload = capacityResult?.hydrationPayload ?? null;

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <PrimaryNav filters={filters} active="capacity" role={activeRole} />
                <main className="flex min-w-0 flex-1 flex-col gap-8">
                    <UpgradeGate
                        feature="capacity_forecast"
                        requiredTier="team"
                        currentTier={currentTier}
                        features={features}
                    >
                        <header className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                                <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                                    Capacity
                                </p>
                                <h1 className="mt-2 font-(--font-display) text-3xl">
                                    Capacity Planning
                                </h1>
                                <p className="mt-2 text-sm text-(--ink-muted)">
                                    Monte Carlo forecasting for work completion based on historical
                                    throughput.
                                </p>
                            </div>
                            <BackLink href={withFilterParam("/", filters, activeRole)} />
                        </header>

                        <FilterBar view="capacity-planning" />

                        <div className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-3 text-xs leading-relaxed text-(--ink-muted)">
                            <span className="text-foreground font-semibold uppercase tracking-wider">
                                Perspective:
                            </span>{" "}
                            Forecasts use Monte Carlo simulation based on historical throughput
                            data. Adjust the date range to control how much history informs the
                            forecast.
                        </div>

                        <ContextStrip filters={filters} origin={activeOrigin} />

                        <HydrateUrqlResults payload={capacityHydrationPayload} />
                        <CapacityView filters={filters} orgId={hydrationOrgId} />
                    </UpgradeGate>
                </main>
            </div>
        </div>
    );
}
