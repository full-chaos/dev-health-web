import { AIAutomationsDashboard } from "@/components/ai/AIAutomationsDashboard";
import { AIPageHeader } from "@/components/ai/AIPageHeader";
import { FilterBar } from "@/components/filters/FilterBar";
import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { metricFilterToAIFilter } from "@/lib/filters/ai";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { navTrailForPathname } from "@/lib/navigation/areas";

type AIAutomationsPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AIAutomationsPage({ searchParams }: AIAutomationsPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);
    const aiFilter = metricFilterToAIFilter(filters);
    const health = await checkApiHealth();

    if (!health.ok) {
        return <ServiceUnavailable />;
    }

    return (
        <>
            <AIPageHeader
                eyebrow="AI"
                title="Automations"
                breadcrumbs={navTrailForPathname("/ai/automations")}
            >
                Candidate patterns for responsible automation, separated from Impact diagnostics so
                teams can triage opportunities directly.
            </AIPageHeader>
            <GlobalContextBar filters={filters} />
            <FilterBar view="ai" />
            <AIAutomationsDashboard filter={aiFilter} />
        </>
    );
}
