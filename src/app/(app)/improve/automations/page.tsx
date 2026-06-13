import { AIPageHeader } from "@/components/ai/AIPageHeader";
import { FilterBar } from "@/components/filters/FilterBar";
import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { ImproveAutomationsDashboard } from "@/components/improve/ImproveAutomationsDashboard";
import { checkApiHealth } from "@/lib/api/system";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { navTrailForPathname } from "@/lib/navigation/areas";
import { withFilterParam } from "@/lib/filters/url";

type ImproveAutomationsPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function ImproveAutomationsPage({
    searchParams,
}: ImproveAutomationsPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);
    const health = await checkApiHealth();

    if (!health.ok) {
        return <ServiceUnavailable />;
    }

    const aiAutomationsHref = withFilterParam("/ai/automations", filters, roleParam);

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <PrimaryNav filters={filters} active="improve-automations" role={roleParam} />
                <main className="flex min-w-0 flex-1 flex-col gap-8">
                    <AIPageHeader
                        eyebrow="Improve"
                        title="Automations"
                        breadcrumbs={navTrailForPathname("/improve/automations")}
                    >
                        Non-AI flow opportunities — review latency, cycle time, rework, WIP
                        congestion, throughput, churn, and change failure rate — each firing only
                        when metrics exceed documented thresholds. For AI-workflow automation
                        candidates, see the AI surface.
                    </AIPageHeader>
                    <GlobalContextBar filters={filters} />
                    <FilterBar view="opportunities" />
                    <ImproveAutomationsDashboard aiAutomationsHref={aiAutomationsHref} />
                </main>
            </div>
        </div>
    );
}
