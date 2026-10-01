import { AreaOverview } from "@/components/navigation/AreaOverview";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";
import { getDiagnoseSignals } from "@/lib/areaSignals/diagnose";
import { checkApiHealth } from "@/lib/api/system";
import { getServerEnv } from "@/lib/config";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";

type DiagnosePageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function DiagnosePage({ searchParams }: DiagnosePageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const originParam = Array.isArray(params.origin) ? params.origin[0] : params.origin;
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;
    const activeOrigin = typeof originParam === "string" ? originParam : undefined;
    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);
    const env = getServerEnv();
    const isTestMode =
        env.DEV_HEALTH_TEST_MODE === "true" || env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

    const [health, diagnoseSignals] = await Promise.all([
        checkApiHealth(),
        getDiagnoseSignals(filters, isTestMode),
    ]);

    if (!health.ok && !isTestMode) {
        // The shared app shell owns the `<main>` landmark for this route.
        return <ServiceUnavailable landmark={false} />;
    }

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader
                title="Diagnose"
                subtitle="Investigate flow, investment, landscape, work graph, complexity, cognitive load, bottlenecks, and code from one durable area."
            />

            <ScopeBar view="work" origin={activeOrigin} />

            <AreaOverview
                areaId="diagnose"
                signals={diagnoseSignals}
                filters={filters}
                role={activeRole}
                title="Related workflows"
                description="Diagnostic sub-areas, ordered by severity."
            />
        </div>
    );
}
