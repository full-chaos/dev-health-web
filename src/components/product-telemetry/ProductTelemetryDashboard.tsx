import { TimeseriesChart } from "@/components/charts/TimeseriesChart";
import { DataState } from "@/components/ui/DataState";
import { VALUE_ABSENCE_LABEL } from "@/lib/chartUtils";
import type { ProductTelemetryDashboardData } from "@/lib/graphql/productTelemetryFetchers";

type ProductTelemetryDashboardProps = {
    dashboard: ProductTelemetryDashboardData;
    startDate: string;
    endDate: string;
};

const formatNumber = (value: number | null | undefined) =>
    value === null || value === undefined
        ? VALUE_ABSENCE_LABEL.absent
        : new Intl.NumberFormat("en-US").format(value);

const formatDuration = (valueMs: number | null | undefined) => {
    if (valueMs === null || valueMs === undefined) return VALUE_ABSENCE_LABEL.absent;
    return `${(valueMs / 1000).toFixed(1)}s`;
};

function SectionCard({
    title,
    description,
    children,
}: {
    title: string;
    description: string;
    children: React.ReactNode;
}) {
    return (
        <section className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5 shadow-[0_24px_80px_-56px_rgba(0,0,0,0.55)]">
            <div className="mb-4">
                <h2 className="text-lg font-semibold text-foreground">{title}</h2>
                <p className="mt-1 text-sm text-(--ink-muted)">{description}</p>
            </div>
            {children}
        </section>
    );
}

function EmptyState() {
    return (
        <DataState
            variant="detector-enabled-no-findings"
            description="No product telemetry events in this window."
        />
    );
}

function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<string | number>> }) {
    if (rows.length === 0) return <EmptyState />;
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.16em] text-(--ink-muted)">
                    <tr className="border-b border-(--card-stroke)">
                        {headers.map((header) => (
                            <th key={header} className="py-2 pr-4 font-medium">
                                {header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-(--card-stroke)">
                    {rows.map((row) => (
                        <tr key={row.join("|")}>
                            {row.map((cell, cellIndex) => (
                                <td
                                    key={`${row[0]}-${headers[cellIndex]}`}
                                    className="py-3 pr-4 text-(--ink-muted)"
                                >
                                    <span
                                        className={
                                            cellIndex === 0
                                                ? "font-medium text-foreground"
                                                : undefined
                                        }
                                    >
                                        {cell}
                                    </span>
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function ProductTelemetryDashboard({
    dashboard,
    startDate,
    endDate,
}: ProductTelemetryDashboardProps) {
    const latestActiveUsers = dashboard.dailyActiveUsers.at(-1)?.activeAnonymousUsers;
    const totalRouteEvents = dashboard.topRoutes.reduce((total, row) => total + row.events, 0);
    const totalFeatureViews = dashboard.featureViews.reduce((total, row) => total + row.views, 0);
    const totalErrors = dashboard.clientErrors.reduce((total, row) => total + row.errors, 0);

    return (
        <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                    [
                        "Active users",
                        formatNumber(latestActiveUsers),
                        "Latest daily anonymous users",
                    ],
                    ["Route events", formatNumber(totalRouteEvents), "Page views in top routes"],
                    ["Feature views", formatNumber(totalFeatureViews), "Stable feature IDs viewed"],
                    ["Client errors", formatNumber(totalErrors), "Rendered by route and boundary"],
                ].map(([label, value, caption]) => (
                    <div
                        key={label}
                        className="rounded-3xl border border-(--card-stroke) bg-card p-5"
                    >
                        <p className="text-xs uppercase tracking-[0.18em] text-(--ink-muted)">
                            {label}
                        </p>
                        <p className="mt-3 font-(--font-display) text-3xl font-semibold text-foreground">
                            {value}
                        </p>
                        <p className="mt-2 text-xs text-(--ink-muted)">{caption}</p>
                    </div>
                ))}
            </div>

            <SectionCard
                title="Daily active anonymous users"
                description={`Half-open window from ${startDate} to ${endDate}.`}
            >
                {dashboard.dailyActiveUsers.length ? (
                    <TimeseriesChart
                        data={dashboard.dailyActiveUsers.map((point) => ({
                            day: point.day,
                            value: point.activeAnonymousUsers,
                        }))}
                        height={240}
                    />
                ) : (
                    <EmptyState />
                )}
            </SectionCard>

            <div className="grid gap-6 xl:grid-cols-2">
                <SectionCard
                    title="Top route patterns"
                    description="Page-view events by route pattern."
                >
                    <DataTable
                        headers={["Route", "Events", "Sessions", "Users"]}
                        rows={dashboard.topRoutes.map((row) => [
                            row.routePattern,
                            formatNumber(row.events),
                            formatNumber(row.sessions),
                            formatNumber(row.anonymousUsers),
                        ])}
                    />
                </SectionCard>

                <SectionCard title="Feature views" description="Stable feature IDs by surface.">
                    <DataTable
                        headers={["Feature", "Surface", "Views", "Users"]}
                        rows={dashboard.featureViews.map((row) => [
                            row.feature,
                            row.surface,
                            formatNumber(row.views),
                            formatNumber(row.anonymousUsers),
                        ])}
                    />
                </SectionCard>

                <SectionCard
                    title="Filter changes"
                    description="Filter usage by view and filter key."
                >
                    <DataTable
                        headers={["Filter", "View", "Changes", "Avg values"]}
                        rows={dashboard.filterChanges.map((row) => [
                            row.filterKey,
                            row.view,
                            formatNumber(row.changes),
                            row.avgValueCount?.toFixed(1) ?? VALUE_ABSENCE_LABEL.absent,
                        ])}
                    />
                </SectionCard>

                <SectionCard
                    title="Chart interactions"
                    description="Chart actions by chart type and surface."
                >
                    <DataTable
                        headers={["Chart", "Action", "Surface", "Interactions"]}
                        rows={dashboard.chartInteractions.map((row) => [
                            row.chart,
                            row.action,
                            row.surface,
                            formatNumber(row.interactions),
                        ])}
                    />
                </SectionCard>

                <SectionCard
                    title="Client errors"
                    description="Client error classes by route and boundary."
                >
                    <DataTable
                        headers={["Error class", "Route", "Boundary", "Errors"]}
                        rows={dashboard.clientErrors.map((row) => [
                            row.errorClass,
                            row.routePattern,
                            row.boundary,
                            formatNumber(row.errors),
                        ])}
                    />
                </SectionCard>

                <SectionCard
                    title="Session summary"
                    description="Session duration and interaction shape."
                >
                    <div className="grid gap-3 sm:grid-cols-3">
                        {[
                            ["p50", formatDuration(dashboard.sessionSummary.p50DurationMs)],
                            ["p75", formatDuration(dashboard.sessionSummary.p75DurationMs)],
                            ["p90", formatDuration(dashboard.sessionSummary.p90DurationMs)],
                            ["p95", formatDuration(dashboard.sessionSummary.p95DurationMs)],
                            [
                                "Pages",
                                dashboard.sessionSummary.avgPagesViewed?.toFixed(1) ??
                                    VALUE_ABSENCE_LABEL.absent,
                            ],
                            [
                                "Interactions",
                                dashboard.sessionSummary.avgInteractions?.toFixed(1) ??
                                    VALUE_ABSENCE_LABEL.absent,
                            ],
                        ].map(([label, value]) => (
                            <div
                                key={label}
                                className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4"
                            >
                                <p className="text-xs uppercase tracking-[0.18em] text-(--ink-muted)">
                                    {label}
                                </p>
                                <p className="mt-2 text-xl font-semibold text-foreground">
                                    {value}
                                </p>
                            </div>
                        ))}
                    </div>
                </SectionCard>
            </div>
        </div>
    );
}
