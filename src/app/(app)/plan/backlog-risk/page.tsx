import { FilterBar } from "@/components/filters/FilterBar";
import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { BackLink } from "@/components/shared/BackLink";
import { DataState } from "@/components/ui/DataState";
import { checkApiHealth } from "@/lib/api/system";
import { requireSession } from "@/lib/auth";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { formatNumber } from "@/lib/formatters";
import { withFilterParam } from "@/lib/filters/url";
import { getThroughputForecastViaGraphQL } from "@/lib/graphql/capacityFetchers";
import type { ThroughputRiskOverlay } from "@/lib/graphql/types";

type BacklogRiskPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

type StatusBadgeProps = {
    active: boolean;
};

function StatusBadge({ active }: StatusBadgeProps) {
    return (
        <span
            className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${
                active ? "bg-amber-500/15 text-amber-200" : "bg-emerald-500/10 text-emerald-200"
            }`}
        >
            {active ? "Elevated" : "Normal"}
        </span>
    );
}

type WipSignalCardProps = {
    overlay: ThroughputRiskOverlay;
    backlogSize: number;
};

function WipSignalCard({ overlay, backlogSize }: WipSignalCardProps) {
    const currentWip = overlay.value;
    const wipRatio =
        backlogSize > 0
            ? `${formatNumber((currentWip / backlogSize) * 100, { maximumFractionDigits: 1 })}%`
            : "—";

    return (
        <section className="grid gap-4 rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6 md:grid-cols-3">
            <div>
                <p className="text-xs uppercase tracking-[0.18em] text-(--ink-muted)">WIP Count</p>
                <p className="mt-3 text-3xl font-semibold">{formatNumber(currentWip)}</p>
                <p className="mt-1 text-xs text-(--ink-muted)">Items in progress</p>
            </div>
            <div>
                <p className="text-xs uppercase tracking-[0.18em] text-(--ink-muted)">
                    WIP vs Backlog
                </p>
                <p className="mt-3 text-3xl font-semibold">{wipRatio}</p>
                <p className="mt-1 text-xs text-(--ink-muted)">
                    {formatNumber(backlogSize)} open items total
                </p>
            </div>
            <div>
                <p className="text-xs uppercase tracking-[0.18em] text-(--ink-muted)">Congestion</p>
                <div className="mt-3 flex items-center gap-3">
                    <p className="text-3xl font-semibold">
                        {formatNumber(overlay.value / Math.max(overlay.threshold, 1), {
                            maximumFractionDigits: 2,
                        })}
                        ×
                    </p>
                    <StatusBadge active={overlay.active} />
                </div>
                <p className="mt-1 text-xs text-(--ink-muted)">
                    Threshold {formatNumber(overlay.threshold, { maximumFractionDigits: 2 })}×
                </p>
            </div>
        </section>
    );
}

function NoForecastState() {
    return (
        <section className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-8">
            <DataState
                variant="insufficient-confidence"
                title="Not enough throughput history"
                description="Widen the date range, select a different team, or sync more work-item history to populate WIP signals."
            />
        </section>
    );
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

    const orgId = session.user.org_id ?? "default-org";
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
                    <FilterBar view="capacity-planning" />

                    {forecast ? (
                        <>
                            <WipSignalCard
                                overlay={forecast.wipCongestion}
                                backlogSize={forecast.backlogSize}
                            />

                            <section className="grid gap-4 md:grid-cols-2">
                                <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6">
                                    <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-(--ink-muted)">
                                        Stale WIP
                                    </h2>
                                    <DataState
                                        variant="detector-unavailable"
                                        className="mt-4"
                                        title="WIP age metrics not yet wired"
                                        description="Items that appear stuck in progress for too long will surface here once WIP age rollups are connected."
                                        detail="Work item age rollups (wip_age_p90_hours)"
                                    />
                                </div>

                                <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6">
                                    <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-(--ink-muted)">
                                        Unestimated Debt
                                    </h2>
                                    <DataState
                                        variant="detector-unavailable"
                                        className="mt-4"
                                        title="Estimate coverage not yet wired"
                                        description="The share of backlog items lacking size estimates will appear here once estimate coverage rollups are connected."
                                        detail="Work item estimate coverage rollups"
                                    />
                                </div>
                            </section>
                        </>
                    ) : (
                        <NoForecastState />
                    )}
                </main>
            </div>
        </div>
    );
}
