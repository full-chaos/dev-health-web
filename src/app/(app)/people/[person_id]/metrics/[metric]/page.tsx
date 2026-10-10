import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter } from "@/lib/filters/encode";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { HeatmapPanel } from "@/components/charts/HeatmapPanel";
import { TimeseriesChart } from "@/components/charts/TimeseriesChart";
import { buttonClassName } from "@/components/shared/Button";
import { PersonRangeBar } from "@/components/people/PersonRangeBar";
import { checkApiHealth } from "@/lib/api/system";
import { getHeatmap } from "@/lib/api/visuals";
import { getPersonDrilldown, getPersonMetric, getPersonSummary } from "@/lib/api/people";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { formatNumber } from "@/lib/formatters";
import { getMetricLabel } from "@/lib/metrics/catalog";
import { CTA_LABELS } from "@/lib/design/cta";
import { getRangeParams, withRangeParams } from "@/lib/people/query";
import { Notice } from "@/components/ui/Notice";
import { PersonEvidenceTable } from "@/components/people/PersonEvidenceTable";
import { PageHeader } from "@/components/shell/PageHeader";

const getEvidenceTypeFromLink = (link?: string) => {
    if (!link) {
        return null;
    }
    try {
        const url = new URL(link, "http://localhost");
        if (url.pathname.includes("/drilldown/prs")) {
            return "prs";
        }
        if (url.pathname.includes("/drilldown/issues")) {
            return "issues";
        }
    } catch {
        return null;
    }
    return null;
};

const pickDefinitionValue = (
    definition: Record<string, string | number | string[]> | undefined,
    keys: string[],
) => {
    if (!definition) {
        return null;
    }
    for (const key of keys) {
        const value = definition[key];
        if (typeof value === "string" && value.trim().length) {
            return value;
        }
    }
    return null;
};

type PersonMetricPageProps = {
    params: Promise<{ person_id: string; metric: string }>;
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function PersonMetricPage({ params, searchParams }: PersonMetricPageProps) {
    const health = await checkApiHealth();

    const { person_id: personId, metric } = await params;
    const rawParams = (await searchParams) ?? {};
    const { range_days, compare_days } = getRangeParams(rawParams);
    const encodedFilter = Array.isArray(rawParams.f) ? rawParams.f[0] : rawParams.f;
    const filters = encodedFilter ? decodeFilter(encodedFilter) : defaultMetricFilter;

    const evidenceParam = Array.isArray(rawParams.evidence)
        ? rawParams.evidence[0]
        : rawParams.evidence;
    const evidenceType =
        evidenceParam === "prs" || evidenceParam === "issues" ? evidenceParam : null;
    const limitParam = Array.isArray(rawParams.limit) ? rawParams.limit[0] : rawParams.limit;
    const limit = limitParam ? Math.max(1, Number(limitParam)) : 50;
    const cursorParam = Array.isArray(rawParams.cursor) ? rawParams.cursor[0] : rawParams.cursor;

    const [summary, metricData] = await Promise.all([
        fetchOrNull(
            getPersonSummary({ personId, range_days, compare_days }),
            `people/${personId}/summary`,
        ),
        fetchOrNull(
            getPersonMetric({ personId, metric, range_days, compare_days }),
            `people/${personId}/metric-${metric}`,
        ),
    ]);
    const activeHoursHeatmap = await fetchOrNull(
        getHeatmap({
            type: "individual",
            metric: "active_hours",
            scope_type: "person",
            scope_id: personId,
            range_days,
        }),
        `people/${personId}/active-hours-heatmap`,
    );

    const person = summary?.person;
    const label = metricData?.label ?? getMetricLabel(metric);
    const definition = metricData?.definition;
    const definitionSummary = pickDefinitionValue(definition, [
        "summary",
        "description",
        "definition",
        "what_it_measures",
    ]);
    const interpretation = pickDefinitionValue(definition, [
        "interpretation",
        "how_to_interpret",
        "guidance",
    ]);
    const definitionEntries = definition
        ? Object.entries(definition).filter(
              ([, value]) =>
                  typeof value === "string" || typeof value === "number" || Array.isArray(value),
          )
        : [];

    const drilldown = evidenceType
        ? await fetchOrNull(
              getPersonDrilldown({
                  personId,
                  type: evidenceType,
                  limit,
                  cursor: cursorParam ?? undefined,
                  metric,
                  range_days,
                  compare_days,
              }),
              `people/${personId}/drilldown-${evidenceType}`,
          )
        : null;

    const breakdowns = metricData?.breakdowns ?? {};
    const drivers = metricData?.drivers ?? [];
    const timeseries = metricData?.timeseries ?? [];

    const breakdownGroups = [
        {
            id: "repo",
            isEntity: true,
            label: "By repo",
            items:
                breakdowns.by_repo?.map((item) => ({
                    label: item.label,
                    value: item.value,
                })) ?? [],
        },
        {
            id: "work",
            isEntity: false,
            label: "By work type",
            items:
                breakdowns.by_work_type?.map((item) => ({
                    label: item.label,
                    value: item.value,
                })) ?? [],
        },
        {
            id: "stage",
            isEntity: false,
            label: "By stage",
            items:
                breakdowns.by_stage?.map((item) => ({
                    label: item.label,
                    value: item.value,
                })) ?? [],
        },
    ];

    const evidenceHref = (type: "prs" | "issues") =>
        withRangeParams(`/people/${personId}/metrics/${metric}`, range_days, compare_days, {
            evidence: type,
            limit,
        });

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader
                title={label}
                subtitle={
                    <>
                        {person?.display_name ?? "Individual"} • {range_days}d window
                    </>
                }
                back={{
                    href: withRangeParams(`/people/${personId}`, range_days, compare_days),
                    area: "Individual",
                }}
            >
                <div className="flex flex-wrap gap-2 text-xs text-(--ink-muted)">
                    {(person?.identities ?? []).map((identity) => (
                        <span
                            key={`${personId}-${identity.provider}-${identity.handle}`}
                            className="rounded-full border border-(--card-stroke) bg-(--card-70) px-3 py-1"
                        >
                            {identity.provider}: {identity.handle}
                        </span>
                    ))}
                </div>
            </PageHeader>

            {!health.ok && (
                <Notice variant="warn" live={false}>
                    Data service unavailable. Evidence will refresh once the API is back.
                </Notice>
            )}

            <PersonRangeBar rangeDays={range_days} />

            <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-(--radius-md) border border-(--card-stroke) bg-(--card-80) p-6">
                    <h2 className="font-(--font-display) text-xl">Definition</h2>
                    <p className="mt-2 text-sm text-(--ink-muted)">
                        {definitionSummary ??
                            "Definition will appear when the indicator library is available."}
                    </p>
                    {interpretation && (
                        <p className="mt-3 text-sm text-(--ink-muted)">
                            How to interpret: {interpretation}
                        </p>
                    )}
                    {definitionEntries.length > 0 && (
                        <div className="mt-4 grid gap-2 text-xs text-(--ink-muted)">
                            {definitionEntries.map(([key, value]) => (
                                <div
                                    key={key}
                                    className="flex items-center justify-between rounded-(--radius-sm) border border-(--card-stroke) bg-card px-3 py-2"
                                >
                                    <span className="uppercase tracking-[0.2em]">
                                        {key.replace(/[_-]+/g, " ")}
                                    </span>
                                    <span className="font-semibold text-foreground">
                                        {Array.isArray(value) ? value.join(", ") : String(value)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="rounded-(--radius-md) border border-(--card-stroke) bg-card p-6">
                    <div className="flex items-center justify-between">
                        <h2 className="font-(--font-display) text-xl">Timeseries</h2>
                        <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                            Daily
                        </span>
                    </div>
                    <div className="mt-4">
                        {timeseries.length ? (
                            <TimeseriesChart data={timeseries} height={240} />
                        ) : (
                            <div className="flex h-60 items-center justify-center rounded-(--radius-md) border border-dashed border-(--card-stroke) bg-(--card-60) text-sm text-(--ink-muted)">
                                Timeseries data unavailable.
                            </div>
                        )}
                    </div>
                </div>
            </section>

            <section>
                <HeatmapPanel
                    title="Active hours distribution"
                    description="See when work concentrates across weekdays and hours."
                    request={{
                        type: "individual",
                        metric: "active_hours",
                        scope_type: "developer",
                        scope_id: personId,
                        range_days,
                    }}
                    initialData={activeHoursHeatmap}
                    filters={filters}
                    emptyState="Active hours heatmap unavailable."
                    evidenceTitle="Commit evidence"
                />
            </section>

            <section className="grid gap-6 lg:grid-cols-3">
                {breakdownGroups.map((group) => {
                    return (
                        <div
                            key={group.id}
                            className="rounded-(--radius-md) border border-(--card-stroke) bg-card p-5"
                        >
                            <div className="flex items-center justify-between">
                                <h2 className="font-(--font-display) text-xl">{group.label}</h2>
                                <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                    Breakdown
                                </span>
                            </div>
                            <div className="mt-4">
                                {group.items.length ? (
                                    <HorizontalBarChart
                                        categories={group.items.map((item) => item.label)}
                                        values={group.items.map((item) => item.value)}
                                    />
                                ) : (
                                    <div className="flex h-56 items-center justify-center rounded-(--radius-md) border border-dashed border-(--card-stroke) bg-(--card-60) text-sm text-(--ink-muted)">
                                        No breakdown data.
                                    </div>
                                )}
                            </div>
                            <div className="mt-4 space-y-2 text-sm">
                                {group.items.map((item) => (
                                    <div
                                        key={`${group.id}-${item.label ?? "unknown"}-${item.value}`}
                                        className="flex items-center justify-between rounded-(--radius-sm) border border-(--card-stroke) bg-(--card-70) px-3 py-2"
                                    >
                                        <span>{item.label}</span>
                                        <span className="text-xs text-(--ink-muted)">
                                            {formatNumber(item.value)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-(--radius-md) border border-(--card-stroke) bg-card p-5">
                    <div className="flex items-center justify-between">
                        <h2 className="font-(--font-display) text-xl">Associations</h2>
                        <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                            Evidence linked
                        </span>
                    </div>
                    <div className="mt-4 space-y-3 text-sm">
                        {drivers.length ? (
                            drivers.map((driver) => {
                                const evidence = getEvidenceTypeFromLink(driver.link);
                                const href = evidence ? evidenceHref(evidence) : null;
                                return (
                                    <div
                                        key={`${driver.text}-${driver.link}`}
                                        className="rounded-(--radius-sm) border border-(--card-stroke) bg-(--card-70) px-4 py-3"
                                    >
                                        <p className="text-sm text-foreground">{driver.text}</p>
                                        {href && (
                                            <Link
                                                href={href}
                                                className={buttonClassName("ghost", "sm", "mt-2")}
                                            >
                                                <ArrowRight
                                                    aria-hidden="true"
                                                    className="h-3.5 w-3.5"
                                                />
                                                {CTA_LABELS.openEvidence}
                                            </Link>
                                        )}
                                    </div>
                                );
                            })
                        ) : (
                            <p className="rounded-(--radius-sm) border border-dashed border-(--card-stroke) bg-(--card-60) px-4 py-3 text-sm text-(--ink-muted)">
                                Association statements will appear once data is ingested.
                            </p>
                        )}
                    </div>
                </div>

                <div className="rounded-(--radius-md) border border-(--card-stroke) bg-(--card-80) p-5">
                    <div className="flex items-center justify-between">
                        <h2 className="font-(--font-display) text-xl">{CTA_LABELS.evidence}</h2>
                        <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                            Drilldown
                        </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs uppercase tracking-[0.2em]">
                        <Link
                            href={evidenceHref("prs")}
                            className={`rounded-full border px-3 py-2 ${
                                evidenceType === "prs"
                                    ? "border-(--accent) bg-(--accent)/15 text-foreground"
                                    : "border-(--card-stroke) text-(--ink-muted)"
                            }`}
                        >
                            {CTA_LABELS.pullRequests}
                        </Link>
                        <Link
                            href={evidenceHref("issues")}
                            className={`rounded-full border px-3 py-2 ${
                                evidenceType === "issues"
                                    ? "border-(--accent) bg-(--accent)/15 text-foreground"
                                    : "border-(--card-stroke) text-(--ink-muted)"
                            }`}
                        >
                            {CTA_LABELS.issues}
                        </Link>
                    </div>
                    {evidenceType && (
                        <div className="mt-4 overflow-auto text-xs">
                            <PersonEvidenceTable
                                type={evidenceType}
                                items={drilldown?.items ?? []}
                                fallbackHref={evidenceHref(evidenceType)}
                            />
                            {!drilldown?.items?.length && (
                                <p className="mt-3 text-sm text-(--ink-muted)">
                                    Evidence rows will appear once data is ingested.
                                </p>
                            )}
                        </div>
                    )}
                    {!evidenceType && (
                        <div className="mt-4 rounded-(--radius-sm) border border-dashed border-(--card-stroke) bg-(--card-60) px-4 py-3 text-sm text-(--ink-muted)">
                            Choose PRs or Issues to review evidence.
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
