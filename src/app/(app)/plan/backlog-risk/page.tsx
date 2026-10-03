import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { requireSession } from "@/lib/auth";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { getThroughputForecastViaGraphQL } from "@/lib/graphql/capacityFetchers";
import type { ThroughputForecast } from "@/lib/graphql/types";
import { logger } from "@/lib/logger";

import { PageFactsEvidenceAction } from "@/components/evidence/PageFactsEvidenceAction";

import { ForecastContent, ForecastErrorState, NoForecastState, backlogFacts } from "./_components";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";

type BacklogRiskPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

export default async function BacklogRiskPage({ searchParams }: BacklogRiskPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = firstParam(params.f);
    const originParam = firstParam(params.origin);
    const workScopeId = firstParam(params.scope);
    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);
    const teamIds =
        filters.scope.level === "team" && filters.scope.ids.length > 0 ? filters.scope.ids : null;

    const [health, session] = await Promise.all([checkApiHealth(), requireSession()]);
    if (!health.ok) return <ServiceUnavailable landmark={false} />;

    const orgId = session.user.org_id ?? "";
    let forecast: ThroughputForecast | null = null;
    let forecastFetchFailed = false;
    try {
        forecast = await getThroughputForecastViaGraphQL(orgId, {
            teamIds,
            workScopeId: workScopeId ?? null,
            historyWeeks: 12,
        });
    } catch (err: unknown) {
        forecastFetchFailed = true;
        logger.warn(
            { err, label: "plan/backlog-risk/throughput-forecast" },
            "Backlog risk forecast fetch failed",
        );
    }

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader
                title="Backlog Risk"
                actions={
                    forecast ? (
                        <PageFactsEvidenceAction
                            title="Backlog risk"
                            facts={backlogFacts(forecast)}
                        />
                    ) : undefined
                }
                subtitle="WIP congestion, stale items, and unestimated debt — signals that reduce delivery predictability before they appear in cycle time."
            />

            <ScopeBar pageFilters={false} origin={originParam} />

            {forecastFetchFailed ? (
                <ForecastErrorState />
            ) : forecast ? (
                <ForecastContent forecast={forecast} />
            ) : (
                <NoForecastState />
            )}
        </div>
    );
}
