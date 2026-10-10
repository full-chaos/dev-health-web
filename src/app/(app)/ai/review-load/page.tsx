import { AIReviewLoadDashboard } from "@/components/ai/AIReviewLoadDashboard";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { metricFilterToAIFilter } from "@/lib/filters/ai";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";
import { filtersFromPageParams } from "@/components/shell/scopeBarConfig";

type AIReviewLoadPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AIReviewLoadPage({ searchParams }: AIReviewLoadPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const filters = filtersFromPageParams(encodedFilter, params, { view: "ai" });
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
                title="Review Load"
                subtitle="Diagnostic view for AI-generated review pressure, comparing AI-attributed work against the human baseline without person-level rankings."
            />
            <ScopeBar view="ai" />
            <AIReviewLoadDashboard filter={aiFilter} />
        </div>
    );
}
