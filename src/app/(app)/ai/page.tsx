import { AreaHub } from "@/components/navigation/AreaHub";
import { AreaHubEvidenceAction } from "@/components/navigation/areaHubEvidence";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";
import { filtersFromPageParams } from "@/components/shell/scopeBarConfig";
import { checkApiHealth } from "@/lib/api/system";
import { getAreaSignals } from "@/lib/areaSignals";
import { getServerEnv } from "@/lib/config";

type AIWorkflowsPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

/**
 * `/ai` index — the AI area overview. The shared AreaHub groups the real AI subviews
 * as Signal and Action and routes to them; preview-only routes stay hidden from default
 * navigation until they have distinct views.
 */
export default async function AIWorkflowsPage({ searchParams }: AIWorkflowsPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;
    const filters = filtersFromPageParams(encodedFilter, params, { view: "ai" });

    const env = getServerEnv();
    const isTestMode =
        env.DEV_HEALTH_TEST_MODE === "true" || env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

    const [health, aiSignals] = await Promise.all([
        checkApiHealth(),
        getAreaSignals("ai", filters, isTestMode),
    ]);

    if (!health.ok && !isTestMode) {
        return <ServiceUnavailable landmark={false} />;
    }

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            {/* The area header: it is on the AI overview only. Each AI destination
                has its own title. */}
            <PageHeader
                title="AI"
                subtitle="What AI appears to change across delivery, review, quality, and governance. Open an evidence-backed view for the selected window."
                actions={<AreaHubEvidenceAction title="AI overview" signals={aiSignals} />}
            />
            <ScopeBar view="ai" />
            <AreaHub
                areaId="ai"
                signals={aiSignals}
                filters={filters}
                role={activeRole}
                title="AI"
                description="Available AI views summarize impact, review pressure, governance risk, and automation opportunities."
            />
        </div>
    );
}
