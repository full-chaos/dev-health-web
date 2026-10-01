import { AIAttributionDashboard } from "@/components/ai/AIAttributionDashboard";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { metricFilterToAIFilter } from "@/lib/filters/ai";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";

type AIAttributionPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

/**
 * Dedicated AI Attribution home (CHAOS-2744). Wires the previously
 * structurally-unconnected static preview onto the live `aiAttributionOverview`
 * resolver -- honest no-data/error states, no static preview content.
 */
export default async function AIAttributionPage({ searchParams }: AIAttributionPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);
    const role = Array.isArray(params.role) ? params.role[0] : params.role;
    const aiFilter = metricFilterToAIFilter(filters);
    const health = await checkApiHealth();

    if (!health.ok) {
        return <ServiceUnavailable landmark={false} />;
    }

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader
                title="Attribution"
                subtitle="How work in this window appears to split across AI-assisted, AI-reviewed, agent-created, and unknown-signal kinds, with the persisted evidence behind every bucket."
                back={{ href: withFilterParam("/ai", filters, role), area: "AI" }}
            />

            <ScopeBar view="ai" pageFilters={false} />
            <AIAttributionDashboard filter={aiFilter} />
        </div>
    );
}
