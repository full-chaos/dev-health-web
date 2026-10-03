import { UpgradeGate } from "@/components/billing/UpgradeGate";
import { ForecastEvidenceAction } from "@/components/capacity/ForecastEvidenceAction";
import { RefreshForecastButton } from "@/components/capacity/RefreshForecastButton";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { CapacityView } from "@/components/work/CapacityView";
import { getCurrentOrg, getOrgEntitlements } from "@/lib/admin/server";
import { checkApiHealth } from "@/lib/api/system";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { getCapacityForecastForHydration } from "@/lib/graphql/capacityHydration";
import { HydrateUrqlResults } from "@/lib/graphql/HydrateUrqlResults";
import { runtimeConfig } from "@/lib/runtimeConfig";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";

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
        return <ServiceUnavailable landmark={false} />;
    }

    const features = entitlements?.data?.features ?? {};
    const currentTier = entitlements?.data?.tier;

    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const originParam = Array.isArray(params.origin) ? params.origin[0] : params.origin;
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
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader
                title="Completion Forecast"
                actions={
                    // The Refresh action belongs to the forecast: it is hidden when the
                    // upgrade gate is closed (same test the gate makes).
                    features["capacity_forecast"] === true ? (
                        <>
                            <ForecastEvidenceAction filters={filters} orgId={hydrationOrgId} />
                            <RefreshForecastButton filters={filters} orgId={hydrationOrgId} />
                        </>
                    ) : undefined
                }
                subtitle="Monte Carlo is the method behind this completion projection and its confidence bands. Adjust the date range to control how much history informs the forecast."
            />

            <ScopeBar view="capacity-planning" origin={activeOrigin} />

            <UpgradeGate
                feature="capacity_forecast"
                requiredTier="team"
                currentTier={currentTier}
                features={features}
            >
                <HydrateUrqlResults payload={capacityHydrationPayload} />
                <CapacityView filters={filters} orgId={hydrationOrgId} />
            </UpgradeGate>
        </div>
    );
}
