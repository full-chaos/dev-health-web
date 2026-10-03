import Link from "next/link";

import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { buttonClassName } from "@/components/shared/Button";
import { Section } from "@/components/ui/Section";
import { QualityEvidenceTiles } from "@/components/quality/QualityEvidenceTiles";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";
import { ReworkThemeBars } from "@/components/quality/ReworkThemeBars";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { getExplainData } from "@/lib/api/home";
import { getHomeDataViaGraphQL } from "@/lib/graphql/homeFetchers";
import { CTA_LABELS } from "@/lib/design/cta";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { buildExploreUrl } from "@/lib/filters/url";
import { formatDelta, formatMetricValue } from "@/lib/formatters";
import { FALLBACK_DELTAS } from "@/lib/metrics/catalog";
import type { MetricDelta } from "@/lib/types";
import { EntityLabel } from "@/components/labels/EntityLabel";
import { resolveEntityLabels } from "@/lib/labels/entityLabel";

type QualityPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

const getMetric = (deltas: MetricDelta[], metric: string) =>
    deltas.find((item) => item.metric === metric) ??
    FALLBACK_DELTAS.find((item) => item.metric === metric);

export default async function QualityPage({ searchParams }: QualityPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;

    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

    // Run health check in parallel with all data fetches to eliminate the waterfall.
    const [health, home, explain] = await Promise.all([
        checkApiHealth(),
        fetchOrNull(getHomeDataViaGraphQL(filters), "quality/home-data"),
        fetchOrNull(
            getExplainData({ metric: "change_failure_rate", filters }),
            "quality/explain-change_failure_rate",
        ),
    ]);

    if (!health.ok) {
        return <ServiceUnavailable landmark={false} />;
    }

    const deltas = home?.deltas?.length ? home.deltas : FALLBACK_DELTAS;
    const placeholderDeltas = !home?.deltas?.length;

    const changeFailureMetric = getMetric(deltas, "change_failure_rate");
    const ciMetric = getMetric(deltas, "ci_success");
    const reworkMetric = getMetric(deltas, "pr_rework_ratio");
    const reworkThemeAllocation = home?.rework_theme_allocation ?? [];

    const drivers = (explain?.drivers ?? []).slice(0, 5);
    const contributors = (explain?.contributors ?? []).slice(0, 5);
    // Render-safe association labels (A7): prefer the server-resolved display
    // name; genuinely-unresolved ids degrade to a stable short token + badge.
    const driverChartLabels = resolveEntityLabels(
        drivers.map((d) => d.id),
        (_id, i) => ({
            name: drivers[i]?.display_name ?? undefined,
            unresolvedFallback: "Unresolved",
        }),
    );

    // The Explore view of change failure rate: the head action of both association cards.
    const cfrEvidenceHref = buildExploreUrl({
        metric: "change_failure_rate",
        filters,
        role: activeRole,
    });

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8">
            <PageHeader
                title="Quality"
                subtitle="Change failure, CI stability, and rework indicators."
            >
                <p className="text-sm text-(--ink-muted)">Open a metric to investigate.</p>
            </PageHeader>

            <ScopeBar view="quality" />

            <QualityEvidenceTiles
                filters={filters}
                role={activeRole}
                tiles={[
                    {
                        metric: "change_failure_rate",
                        label: changeFailureMetric?.label ?? "Change Failure Rate",
                        value: placeholderDeltas ? undefined : changeFailureMetric?.value,
                        unit: changeFailureMetric?.unit,
                        delta: placeholderDeltas ? undefined : changeFailureMetric?.delta_pct,
                        spark: changeFailureMetric?.spark,
                        description: "Change failure rate",
                    },
                    {
                        metric: "ci_success",
                        label: ciMetric?.label ?? "CI Success Rate",
                        value: placeholderDeltas ? undefined : ciMetric?.value,
                        unit: ciMetric?.unit,
                        delta: placeholderDeltas ? undefined : ciMetric?.delta_pct,
                        spark: ciMetric?.spark,
                        description: "Pipeline success",
                    },
                    {
                        metric: "pr_rework_ratio",
                        label: reworkMetric?.label ?? "PR Rework Ratio",
                        value: placeholderDeltas ? undefined : reworkMetric?.value,
                        unit: reworkMetric?.unit,
                        delta: placeholderDeltas ? undefined : reworkMetric?.delta_pct,
                        spark: reworkMetric?.spark,
                        description: "PRs requiring rework",
                    },
                ]}
            />

            {reworkThemeAllocation.length > 0 && (
                <Section
                    title="Rework by Theme"
                    description="Distribution of rework pressure across investment themes in the selected window."
                    data-testid="quality-rework-by-theme"
                >
                    <ReworkThemeBars rows={reworkThemeAllocation} />
                </Section>
            )}

            <div className="grid gap-4.5 lg:grid-cols-2">
                <Section
                    title="Change Failure Associations"
                    data-testid="quality-associations"
                    action={
                        <Link href={cfrEvidenceHref} className={buttonClassName("ghost", "sm")}>
                            {CTA_LABELS.openEvidence}
                        </Link>
                    }
                >
                    {drivers.length ? (
                        <div className="space-y-4">
                            <HorizontalBarChart
                                categories={driverChartLabels.labels}
                                values={drivers.map((driver) => Math.abs(driver.delta_pct))}
                                categoryTitles={driverChartLabels.titles}
                            />
                            <div className="space-y-2 text-sm">
                                {drivers.map((driver) => (
                                    <Link
                                        key={driver.id}
                                        href={buildExploreUrl({
                                            api: driver.evidence_link,
                                            filters,
                                            role: activeRole,
                                        })}
                                        className="flex items-center justify-between rounded-(--radius-md) border border-(--border) bg-(--surface-raised) px-4 py-2"
                                    >
                                        <EntityLabel
                                            id={driver.id}
                                            displayName={driver.display_name}
                                        />
                                        <span className="text-xs text-(--ink-muted)">
                                            {formatDelta(driver.delta_pct)}
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-(--ink-muted)">
                            Association detail will appear once data is ingested.
                        </p>
                    )}
                </Section>

                <Section
                    title="Contributors"
                    data-testid="quality-contributors"
                    action={
                        <Link href={cfrEvidenceHref} className={buttonClassName("ghost", "sm")}>
                            {CTA_LABELS.openEvidence}
                        </Link>
                    }
                >
                    {contributors.length ? (
                        <div className="space-y-2 text-sm">
                            {contributors.map((contributor) => (
                                <Link
                                    key={contributor.id}
                                    href={buildExploreUrl({
                                        api: contributor.evidence_link,
                                        filters,
                                        role: activeRole,
                                    })}
                                    className="flex items-center justify-between rounded-(--radius-md) border border-(--border) bg-(--surface-raised) px-4 py-2"
                                >
                                    <EntityLabel
                                        id={contributor.id}
                                        displayName={contributor.display_name}
                                    />
                                    <span className="text-xs text-(--ink-muted)">
                                        {explain
                                            ? formatMetricValue(contributor.value, explain.unit)
                                            : "--"}
                                    </span>
                                </Link>
                            ))}
                        </div>
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
