import { AIImpactDashboard } from "@/components/ai/AIImpactDashboard";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { metricFilterToAIFilter } from "@/lib/filters/ai";
import { withFilterParam } from "@/lib/filters/url";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";
import { filtersFromPageParams } from "@/components/shell/scopeBarConfig";

type AIImpactPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AIImpactPage({ searchParams }: AIImpactPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const filters = filtersFromPageParams(encodedFilter, params, { view: "ai" });
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
                title="Impact"
                subtitle="Org-wide view of how AI-assisted workflows appear to influence delivery, review load, quality gaps, and operational drag."
            />

            <ScopeBar view="ai" />
            <AIImpactDashboard
                filter={aiFilter}
                evidenceHref={withFilterParam("/ai/impact/evidence", filters, role)}
            />
        </div>
    );
}
