import { AreaOverview } from "@/components/navigation/AreaOverview";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { getAreaSignals } from "@/lib/areaSignals";
import { getServerEnv } from "@/lib/config";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";

type ImprovePageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function ImprovePage({ searchParams }: ImprovePageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;
    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

    const env = getServerEnv();
    const isTestMode =
        env.DEV_HEALTH_TEST_MODE === "true" || env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

    const [health, improveSignals] = await Promise.all([
        checkApiHealth(),
        getAreaSignals("improve", filters, isTestMode),
    ]);

    if (!health.ok && !isTestMode) {
        return <ServiceUnavailable landmark={false} />;
    }

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader
                title="Improve"
                subtitle="Opportunities, experiments, and automations — each producing actions, not dashboards."
            />

            <ScopeBar pageFilters={false} />

            <AreaOverview
                areaId="improve"
                signals={improveSignals}
                filters={filters}
                role={activeRole}
                title="Related workflows"
                description="Improvement workflows, ordered by severity."
            />
        </div>
    );
}
