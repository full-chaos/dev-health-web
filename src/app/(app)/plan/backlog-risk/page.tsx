import { resolveActiveOrgId } from "@/lib/impersonation";
import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { BackLink } from "@/components/shared/BackLink";
import { checkApiHealth } from "@/lib/api/system";
import { requireSession } from "@/lib/auth";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { getThroughputForecastViaGraphQL } from "@/lib/graphql/capacityFetchers";

import { ForecastContent, NoForecastState } from "./_components";

type BacklogRiskPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

export default async function BacklogRiskPage({ searchParams }: BacklogRiskPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = firstParam(params.f);
    const roleParam = firstParam(params.role);
    const originParam = firstParam(params.origin);
    const workScopeId = firstParam(params.scope);
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;
    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);
    const teamIds =
        filters.scope.level === "team" && filters.scope.ids.length > 0 ? filters.scope.ids : null;

    const [health, session] = await Promise.all([checkApiHealth(), requireSession()]);
    if (!health.ok) return <ServiceUnavailable />;

    const orgId = resolveActiveOrgId(session.user) ?? "default-org";
    const forecast = await fetchOrNull(
        getThroughputForecastViaGraphQL(orgId, {
            teamIds,
            workScopeId: workScopeId ?? null,
            historyWeeks: 12,
        }),
        "plan/backlog-risk/throughput-forecast",
    );

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <PrimaryNav filters={filters} active="backlog-risk" role={activeRole} />
                <main className="flex min-w-0 flex-1 flex-col gap-8">
                    <header className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                                Backlog Risk
                            </p>
                            <h1 className="mt-2 font-(--font-display) text-3xl">Backlog Risk</h1>
                            <p className="mt-2 text-sm text-(--ink-muted)">
                                WIP congestion, stale items, and unestimated debt — signals that
                                reduce delivery predictability before they appear in cycle time.
                            </p>
                        </div>
                        <BackLink href={withFilterParam("/plan", filters, activeRole)} />
                    </header>

                    <GlobalContextBar filters={filters} origin={originParam} />

                    {forecast ? <ForecastContent forecast={forecast} /> : <NoForecastState />}
                </main>
            </div>
        </div>
    );
}
