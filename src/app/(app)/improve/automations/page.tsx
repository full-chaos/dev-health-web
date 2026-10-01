import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { ImproveAutomationsDashboard } from "@/components/improve/ImproveAutomationsDashboard";
import { checkApiHealth } from "@/lib/api/system";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";

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
        return <ServiceUnavailable landmark={false} />;
    }

    const aiAutomationsHref = withFilterParam("/ai/automations", filters, roleParam);

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader
                title="Automations"
                subtitle="Non-AI flow opportunities — review latency, cycle time, rework, WIP congestion, throughput, churn, and change failure rate — each firing only when metrics exceed documented thresholds. For AI-workflow automation candidates, see the AI surface."
            />
            <ScopeBar view="opportunities" />
            <ImproveAutomationsDashboard aiAutomationsHref={aiAutomationsHref} />
        </div>
    );
}
