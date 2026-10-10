import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";

import { QuadrantPanel } from "@/components/charts/QuadrantPanel";
import { associationMeterRows, contributorMeterRows } from "@/components/metrics/associationRows";
import { MetricEvidenceButton } from "@/components/metrics/MetricEvidenceButton";
import { RepoLinkPageNote } from "@/components/shared/RepoLinkPageNote";
import { MetricEvidenceCards } from "@/components/metrics/MetricEvidenceCards";
import { buttonClassName } from "@/components/shared/Button";
import { ModeTabs, type ModeTabItem } from "@/components/shared/ModeTabs";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { MeterRows } from "@/components/ui/MeterRows";
import { Section } from "@/components/ui/Section";
import { checkApiHealth } from "@/lib/api/system";
import { getExplainData } from "@/lib/api/home";
import { getHomeDataViaGraphQL } from "@/lib/graphql/homeFetchers";
import { getQuadrant } from "@/lib/api/visuals";
import { CTA_LABELS } from "@/lib/design/cta";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { FALLBACK_DELTAS } from "@/lib/metrics/catalog";
import { METRIC_TABS } from "@/lib/metrics/metricTabs";
import { getTabSet, tabHref } from "@/lib/navigation/tabs";
import type { MetricDelta } from "@/lib/types";
import { resolveEntityLabels } from "@/lib/labels/entityLabel";
import { PageHeader } from "@/components/shell/PageHeader";
import { PageHeaderEvidenceAction } from "@/components/shell/PageHeaderEvidenceAction";
import { ScopeBar } from "@/components/shell/ScopeBar";
import { filtersFromPageParams } from "@/components/shell/scopeBarConfig";

type MetricsPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

const getMetric = (deltas: MetricDelta[], metric: string) =>
    deltas.find((item) => item.metric === metric) ??
    FALLBACK_DELTAS.find((item) => item.metric === metric);

/** The small note under a chart (prototype `.data-note`): an info icon and one muted line. */
function DataNote({ children }: { children: ReactNode }) {
    return (
        <p
            data-testid="data-note"
            className="mt-2.5 flex items-center gap-1.5 text-xs text-(--ink-muted)"
        >
            <Info aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            {children}
        </p>
    );
}

export default async function MetricsPage({ searchParams }: MetricsPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;

    const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
    const metricsTabs = getTabSet("metrics");
    const activeTab = METRIC_TABS.find((tab) => tab.id === tabParam) ?? METRIC_TABS[0];
    const filters = filtersFromPageParams(encodedFilter, params, {
        view: "metrics",
        tab: activeTab.id,
    });

    const quadrantScope: "org" | "team" | "repo" | "developer" =
        filters.scope.level === "developer"
            ? "developer"
            : filters.scope.level === "team" || filters.scope.level === "repo"
              ? filters.scope.level
              : "org";

    // Run health check in parallel with all data fetches to eliminate the waterfall.
    const [health, home, highlight, quadrant] = await Promise.all([
        checkApiHealth(),
        fetchOrNull(getHomeDataViaGraphQL(filters), "metrics/home-data"),
        fetchOrNull(
            getExplainData({ metric: activeTab.highlight, filters }),
            `metrics/explain-${activeTab.highlight}`,
        ),
        fetchOrNull(
            getQuadrant({
                type: activeTab.quadrant.type,
                scope_type: quadrantScope,
                scope_id: filters.scope.ids[0] ?? "",
                range_days: filters.time.range_days,
                bucket: "week",
                start_date: filters.time.start_date,
                end_date: filters.time.end_date,
                filters,
            }),
            "metrics/quadrant",
        ),
    ]);

    if (!health.ok) {
        return <ServiceUnavailable landmark={false} />;
    }

    const deltas = home?.deltas?.length ? home.deltas : FALLBACK_DELTAS;
    const placeholderDeltas = !home?.deltas?.length;
    const highlightMetric = getMetric(deltas, activeTab.highlight);
    const highlightLabel = highlightMetric?.label ?? activeTab.highlight;

    const drivers = (highlight?.drivers ?? []).slice(0, 5);
    const contributors = (highlight?.contributors ?? []).slice(0, 5);
    // Render-safe association labels (A7): raw ids degrade to stable short
    // tokens; the full label remains in the axis tooltip title.
    const driverChartLabels = resolveEntityLabels(
        drivers.map((d) => d.label),
        { unresolvedFallback: "Unresolved" },
    );
    const contributorChartLabels = resolveEntityLabels(
        contributors.map((c) => c.label),
        { unresolvedFallback: "Unresolved" },
    );

    // The tab's metric: the subject of "View evidence", of the section actions and of both cards.
    const highlightSubject = {
        title: highlightLabel,
        metric: activeTab.highlight,
        filters,
        role: activeRole,
    };

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader
                title="Flow"
                subtitle={activeTab.description}
                actions={<PageHeaderEvidenceAction subject={highlightSubject} />}
            />

            <ScopeBar view="metrics" tab={activeTab.id} />

            <ModeTabs
                ariaLabel="Metrics views"
                activeId={activeTab.id}
                items={METRIC_TABS.map((tab): ModeTabItem => ({
                    id: tab.id,
                    label: tab.label,
                    href: withFilterParam(tabHref(metricsTabs, tab.id), filters, activeRole),
                }))}
            />

            <MetricEvidenceCards
                metrics={activeTab.metrics}
                deltas={deltas}
                filters={filters}
                activeRole={activeRole}
                placeholderDeltas={placeholderDeltas}
            />
            {placeholderDeltas ? null : <RepoLinkPageNote rows={deltas} />}

            <QuadrantPanel
                title={activeTab.quadrant.title}
                description={activeTab.quadrant.description}
                data={quadrant}
                filters={filters}
                emptyState="Quadrant data unavailable for this scope."
                alwaysShowOverlayToggle
                action={
                    // The evidence page of the tab's metric (was the "Open evidence" link above
                    // the tiles). A dot opens the shared drawer by itself.
                    <Link
                        href={buildExploreUrl({
                            metric: activeTab.highlight,
                            filters,
                            role: activeRole,
                        })}
                        data-testid="quadrant-metric-evidence"
                        title={`${CTA_LABELS.metricEvidence}: ${highlightLabel}`}
                        className={buttonClassName("ghost", "sm")}
                    >
                        <ArrowRight aria-hidden="true" className="h-4 w-4" />
                        {CTA_LABELS.metricEvidence}
                    </Link>
                }
            />

            <div data-testid="association-cards" className="grid gap-4.5 lg:grid-cols-2">
                <Section
                    title="Likely associations"
                    description="Selected-window associations"
                    action={
                        <MetricEvidenceButton
                            subject={highlightSubject}
                            section="Likely associations"
                        />
                    }
                >
                    {drivers.length ? (
                        // Meter rows (prototype `bars()`): the fill is |delta| as production
                        // draws it; the value is the served signed percent change.
                        <MeterRows
                            signed
                            aria-label="Likely associations"
                            testId="association-meter-rows"
                            rows={associationMeterRows(drivers, driverChartLabels, {
                                signed: true,
                                unit: highlight?.unit,
                            })}
                        />
                    ) : (
                        <p className="text-sm text-(--ink-muted)">
                            Association detail will appear once data is ingested.
                        </p>
                    )}
                    <DataNote>
                        Association values are percent change in the selected window; no causal
                        conclusion is added.
                    </DataNote>
                </Section>

                <Section
                    title="Primary contributors"
                    description="Where the impact concentrates in this window."
                    action={
                        <MetricEvidenceButton
                            subject={highlightSubject}
                            section="Primary contributors"
                        />
                    }
                >
                    {contributors.length ? (
                        // Meter rows: the served contributor values, each with the served unit.
                        <MeterRows
                            aria-label="Primary contributors"
                            testId="contributor-meter-rows"
                            rows={contributorMeterRows(
                                contributors,
                                highlight?.unit,
                                contributorChartLabels,
                            )}
                        />
                    ) : (
                        <p className="text-sm text-(--ink-muted)">
                            Contributor detail will appear once data is ingested.
                        </p>
                    )}
                </Section>
            </div>
        </div>
    );
}
