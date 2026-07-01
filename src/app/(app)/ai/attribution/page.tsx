import { AIAttributionDashboard } from "@/components/ai/AIAttributionDashboard";
import { AIPageHeader } from "@/components/ai/AIPageHeader";
import { FilterBar } from "@/components/filters/FilterBar";
import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { metricFilterToAIFilter } from "@/lib/filters/ai";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { navTrailForPathname } from "@/lib/navigation/areas";

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
    const aiFilter = metricFilterToAIFilter(filters);
    const health = await checkApiHealth();

    if (!health.ok) {
        return <ServiceUnavailable />;
    }

    return (
        <>
            <AIPageHeader
                eyebrow="AI"
                title="Attribution"
                breadcrumbs={[
                    ...navTrailForPathname("/ai/attribution").map((c) => ({
                        ...c,
                        href: c.href ?? "/ai",
                    })),
                    { label: "Attribution" },
                ]}
            >
                How work in this window appears to split across AI-assisted, AI-reviewed,
                agent-created, and unknown-signal kinds, with the persisted evidence behind every
                bucket.
            </AIPageHeader>

            <GlobalContextBar filters={filters} />
            <FilterBar view="ai" />
            <AIAttributionDashboard filter={aiFilter} />
        </>
    );
}
