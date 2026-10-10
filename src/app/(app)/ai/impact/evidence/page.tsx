import { AIImpactEvidenceList } from "@/components/ai/AIImpactEvidenceList";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { metricFilterToAIFilter } from "@/lib/filters/ai";
import { withFilterParam } from "@/lib/filters/url";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";
import { filtersFromPageParams } from "@/components/shell/scopeBarConfig";

type AIImpactEvidencePageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AIImpactEvidencePage({ searchParams }: AIImpactEvidencePageProps) {
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
                title="PR Evidence"
                subtitle="Every AI-attributed pull request behind the Impact rollups, with provenance badges and Work Graph evidence per PR."
                back={{ href: withFilterParam("/ai/impact", filters, role), area: "Impact" }}
            />

            {/* The list reads the organization, the team, the repository, the window and
                the work type from `f`, so the page has the full scope bar. */}
            <ScopeBar view="ai" />
            <AIImpactEvidenceList filter={aiFilter} />
        </div>
    );
}
