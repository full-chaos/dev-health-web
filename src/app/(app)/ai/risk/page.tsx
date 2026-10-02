import { AIEvidencePanel } from "@/components/ai/AIEvidencePanel";
import {
    AIGovernanceRiskTabs,
    governanceRiskViewFromParam,
} from "@/components/ai/AIGovernanceRiskTabs";
import { AIRiskDashboard } from "@/components/ai/AIRiskDashboard";
import { AITestGapsPanel } from "@/components/ai/AITestGapsPanel";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { metricFilterToAIFilter } from "@/lib/filters/ai";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";

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
        return <ServiceUnavailable landmark={false} />;
    }

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader title="Governance Risk" subtitle={VIEW_LEDES[view]} />
            <ScopeBar view="ai" />
            <AIGovernanceRiskTabs view={view} filters={filters} role={activeRole} />
            {view === "overview" && <AIRiskDashboard filter={aiFilter} />}
            {view === "test-gaps" && <AITestGapsPanel filter={aiFilter} />}
            {view === "evidence" && <AIEvidencePanel filter={aiFilter} />}
        </div>
    );
}
