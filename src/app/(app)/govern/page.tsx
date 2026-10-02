import { AreaOverview } from "@/components/navigation/AreaOverview";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { getGovernSignals } from "@/lib/areaSignals";
import { getServerEnv } from "@/lib/config";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { fetchTestOpsData } from "@/lib/testops/fetchers";

type GovernPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function GovernPage({ searchParams }: GovernPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;
    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

    const env = getServerEnv();
    const isTestMode =
        env.DEV_HEALTH_TEST_MODE === "true" || env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

    const rangeDays = filters?.time?.range_days ?? 14;
    const today = new Date();
    const endDate = filters?.time?.end_date ?? today.toISOString().slice(0, 10);
    const startDate =
        filters?.time?.start_date ??
        new Date(today.getTime() - rangeDays * 86_400_000).toISOString().slice(0, 10);
    const dateRange = { startDate, endDate };

    const [health, testOpsData] = await Promise.all([
        checkApiHealth(),
        fetchTestOpsData(
            {
                timeseries: [
                    {
                        dimension: "TEAM",
                        measure: "PIPELINE_SUCCESS_RATE",
                        interval: "DAY",
                        dateRange,
                    },
                    {
                        dimension: "TEAM",
                        measure: "TEST_FLAKE_RATE",
                        interval: "DAY",
                        dateRange,
                    },
                    {
                        dimension: "TEAM",
                        measure: "COVERAGE_LINE_PCT",
                        interval: "DAY",
                        dateRange,
                    },
                ],
                breakdowns: [],
            },
            isTestMode,
        ),
    ]);

    const governSignals = await getGovernSignals(filters, isTestMode, {
        testOpsData,
    });

    if (!health.ok && !isTestMode) {
        return <ServiceUnavailable landmark={false} />;
    }

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader
                title="Govern"
                subtitle="Quality and risk across delivery, incidents, security, flags, and TestOps."
            />

            <ScopeBar pageFilters={false} />
            <AreaOverview
                areaId="govern"
                signals={governSignals}
                filters={filters}
                role={activeRole}
            />
        </div>
    );
}
