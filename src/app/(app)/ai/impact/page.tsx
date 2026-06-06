import { AIImpactDashboard } from "@/components/ai/AIImpactDashboard";
import { AIPageHeader } from "@/components/ai/AIPageHeader";
import { FilterBar } from "@/components/filters/FilterBar";
import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { metricFilterToAIFilter } from "@/lib/filters/ai";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { navTrailForPathname } from "@/lib/navigation/areas";

type AIImpactPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AIImpactPage({ searchParams }: AIImpactPageProps) {
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
                title="Impact"
                breadcrumbs={[
                    ...navTrailForPathname("/ai/impact").map((c) => ({
                        ...c,
                        href: c.href ?? "/ai",
                    })),
                    { label: "Impact" },
                ]}
            >
                Org-wide view of how AI-assisted workflows appear to influence delivery, review
                load, quality gaps, and operational drag.
            </AIPageHeader>

            <GlobalContextBar filters={filters} />
            <FilterBar view="ai" />
            <AIImpactDashboard filter={aiFilter} />
        </>
    );
}
