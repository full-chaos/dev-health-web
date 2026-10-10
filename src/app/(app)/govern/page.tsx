import { NoOrgNotice } from "@/components/NoOrgNotice";
import { requireSession } from "@/lib/auth";
import { PageFactsEvidenceAction } from "@/components/evidence/PageFactsEvidenceAction";
import { AreaOverview } from "@/components/navigation/AreaOverview";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";
import { filtersFromPageParams } from "@/components/shell/scopeBarConfig";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { getGovernSignals } from "@/lib/areaSignals";
import { getServerEnv } from "@/lib/config";
import { fetchTestOpsData } from "@/lib/testops/fetchers";

import { governEvidenceFacts } from "./governEvidenceFacts";

type GovernPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function GovernPage({ searchParams }: GovernPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;
    const filters = filtersFromPageParams(encodedFilter, params, { pageFilters: false });

    const env = getServerEnv();
    const isTestMode =
        env.DEV_HEALTH_TEST_MODE === "true" || env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";
    // No org on the session: nothing is requested (the TestOps reads reject without one).
    if (!isTestMode && !(await requireSession()).user.org_id) return <NoOrgNotice />;

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

    // The page is the subject of its "View evidence": its served signals, in body order.
    const evidenceFacts = governEvidenceFacts(governSignals);

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader
                title="Govern"
                subtitle="Quality and risk across delivery, incidents, security, flags, and TestOps."
                actions={<PageFactsEvidenceAction title="Govern overview" facts={evidenceFacts} />}
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
