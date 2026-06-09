import { AIImpactEvidenceList } from "@/components/ai/AIImpactEvidenceList";
import { AIPageHeader } from "@/components/ai/AIPageHeader";
import { FilterBar } from "@/components/filters/FilterBar";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { BackLink } from "@/components/shared/BackLink";
import { checkApiHealth } from "@/lib/api/system";
import { metricFilterToAIFilter } from "@/lib/filters/ai";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { navTrailForPathname } from "@/lib/navigation/areas";

type AIImpactEvidencePageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AIImpactEvidencePage({ searchParams }: AIImpactEvidencePageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);
    const role = Array.isArray(params.role) ? params.role[0] : params.role;
    const aiFilter = metricFilterToAIFilter(filters);
    const health = await checkApiHealth();

    if (!health.ok) {
        return <ServiceUnavailable />;
    }

    return (
        <>
            <BackLink href={withFilterParam("/ai/impact", filters, role)} area="Impact" />
            <AIPageHeader
                eyebrow="AI"
                title="PR Evidence"
                breadcrumbs={[
                    ...navTrailForPathname("/ai/impact").map((c) => ({
                        ...c,
                        href: c.href ?? "/ai",
                    })),
                    { label: "Impact", href: withFilterParam("/ai/impact", filters, role) },
                    { label: "PR Evidence" },
                ]}
            >
                Every AI-attributed pull request behind the Impact rollups, with provenance badges
                and Work Graph evidence per PR.
            </AIPageHeader>

            {/* Single context bar per the IA dual-bar invariant: the drilldown
                keeps FilterBar (it drives the PR list); area context comes from
                the AI chrome. */}
            <FilterBar view="ai" />
            <AIImpactEvidenceList filter={aiFilter} />
        </>
    );
}
