import { associationMeterRows, contributorMeterRows } from "@/components/metrics/associationRows";
import { MetricEvidenceButton } from "@/components/metrics/MetricEvidenceButton";
import { QualityEvidenceTiles } from "@/components/quality/QualityEvidenceTiles";
import { ReworkThemeBars } from "@/components/quality/ReworkThemeBars";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { MeterRows } from "@/components/ui/MeterRows";
import { Section } from "@/components/ui/Section";
import { checkApiHealth } from "@/lib/api/system";
import { getExplainData } from "@/lib/api/home";
import { getHomeDataViaGraphQL } from "@/lib/graphql/homeFetchers";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { FALLBACK_DELTAS } from "@/lib/metrics/catalog";
import type { MetricDelta } from "@/lib/types";
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

    const contributorChartLabels = resolveEntityLabels(
        contributors.map((c) => c.id),
        (_id, i) => ({
            name: contributors[i]?.display_name ?? undefined,
            unresolvedFallback: "Unresolved",
        }),
    );

    // Change failure rate: the subject of both association cards' evidence action. The shared
    // drawer lists the drivers and contributors with their evidence links and links to Explore.
    const cfrSubject = {
        title: changeFailureMetric?.label ?? "Change Failure Rate",
        metric: "change_failure_rate",
        filters,
        role: activeRole,
    };

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
                        <MetricEvidenceButton
                            subject={cfrSubject}
                            section="Change Failure Associations"
                        />
                    }
                >
                    {drivers.length ? (
                        // Meter rows (prototype `bars()`): the fill is |delta| as production draws
                        // it; the value is the served signed percent change. Each driver's own
                        // evidence link is in the drawer the head action opens.
                        <MeterRows
                            aria-label="Change failure associations"
                            testId="association-meter-rows"
                            rows={associationMeterRows(drivers, driverChartLabels)}
                        />
                    ) : (
                        <p className="text-sm text-(--ink-muted)">
                            Association detail will appear once data is ingested.
                        </p>
                    )}
                </Section>

                <Section
                    title="Contributors"
                    data-testid="quality-contributors"
                    action={<MetricEvidenceButton subject={cfrSubject} section="Contributors" />}
                >
                    {contributors.length ? (
                        // Meter rows: the served contributor values, each with the served unit.
                        <MeterRows
                            aria-label="Contributors"
                            testId="contributor-meter-rows"
                            rows={contributorMeterRows(
                                contributors,
                                explain?.unit,
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
