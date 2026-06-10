import { AIEvidencePanel } from "@/components/ai/AIEvidencePanel";
import {
    AIGovernanceRiskTabs,
    governanceRiskViewFromParam,
} from "@/components/ai/AIGovernanceRiskTabs";
import { AIRiskDashboard } from "@/components/ai/AIRiskDashboard";
import { AITestGapsPanel } from "@/components/ai/AITestGapsPanel";
import { AIPageHeader } from "@/components/ai/AIPageHeader";
import { FilterBar } from "@/components/filters/FilterBar";
import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { metricFilterToAIFilter } from "@/lib/filters/ai";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { navTrailForPathname } from "@/lib/navigation/areas";

type AIRiskPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

const VIEW_LEDES = {
    overview:
        "Quality-risk diagnostics for AI-associated work, including baseline deltas, explicit missing-data states, and governance findings.",
    "test-gaps":
        "Where AI-attributed change appears to land without matching test coverage signals, with the human baseline alongside.",
    evidence:
        "The Work Graph evidence trail behind AI governance signals, explorable per AI-attributed pull request.",
} as const;

const VIEW_CRUMBS = {
    "test-gaps": "Test Gaps",
    evidence: "Evidence",
} as const;

export default async function AIRiskPage({ searchParams }: AIRiskPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;
    const viewParam = Array.isArray(params.view) ? params.view[0] : params.view;
    const view = governanceRiskViewFromParam(viewParam);
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
                title="Governance Risk"
                breadcrumbs={[
                    ...navTrailForPathname("/ai/risk").map((c) => ({
                        ...c,
                        href: c.href ?? "/ai",
                    })),
                    ...(view === "overview"
                        ? [{ label: "Governance Risk" }]
                        : [
                              { label: "Governance Risk", href: "/ai/risk" },
                              { label: VIEW_CRUMBS[view] },
                          ]),
                ]}
            >
                {VIEW_LEDES[view]}
            </AIPageHeader>
            <GlobalContextBar filters={filters} />
            <FilterBar view="ai" />
            <AIGovernanceRiskTabs view={view} filters={filters} role={activeRole} />
            {view === "overview" && <AIRiskDashboard filter={aiFilter} />}
            {view === "test-gaps" && <AITestGapsPanel filter={aiFilter} />}
            {view === "evidence" && <AIEvidencePanel filter={aiFilter} />}
        </>
    );
}
