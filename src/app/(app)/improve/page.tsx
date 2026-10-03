import {
    PageFactsEvidenceAction,
    type PageFact,
} from "@/components/evidence/PageFactsEvidenceAction";
import { AreaOverview } from "@/components/navigation/AreaOverview";
import { Notice } from "@/components/ui/Notice";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { getAreaSignals } from "@/lib/areaSignals";
import type { AreaSignal } from "@/lib/areaSignals/types";
import { getServerEnv } from "@/lib/config";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";

/** The page's served signals for the evidence drawer: label, value and metric as the cards show them. */
function improveFacts(signals: AreaSignal[]): PageFact[] {
    return signals.map((signal) => ({
        label: signal.label,
        value:
            signal.state === "unavailable" ? undefined : `${signal.value} · ${signal.metricLabel}`,
    }));
}

type ImprovePageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function ImprovePage({ searchParams }: ImprovePageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;
    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

    const env = getServerEnv();
    const isTestMode =
        env.DEV_HEALTH_TEST_MODE === "true" || env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

    const [health, improveSignals] = await Promise.all([
        checkApiHealth(),
        getAreaSignals("improve", filters, isTestMode),
    ]);

    if (!health.ok && !isTestMode) {
        return <ServiceUnavailable landmark={false} />;
    }

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader
                title="Improve"
                subtitle="Opportunities, experiments, and automations — each producing actions, not dashboards."
                actions={
                    <PageFactsEvidenceAction title="Improve" facts={improveFacts(improveSignals)} />
                }
            />

            <ScopeBar pageFilters={false} />

            <AreaOverview
                areaId="improve"
                signals={improveSignals}
                filters={filters}
                role={activeRole}
                note={
                    <Notice variant="info" live={false} data-testid="improve-destinations-note">
                        Improvement Automations and AI Automations are separate destinations.
                        Neither becomes an automatic action simply because a suggestion appears.
                    </Notice>
                }
            />
        </div>
    );
}
