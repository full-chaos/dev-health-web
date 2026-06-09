import Link from "next/link";

import { DonutChart } from "@/components/charts/DonutChart";
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { QuadrantPanel } from "@/components/charts/QuadrantPanel";
import { PersonRangeBar } from "@/components/people/PersonRangeBar";
import { MetricCard } from "@/components/metrics/MetricCard";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { BackLink } from "@/components/shared/BackLink";
import { checkApiHealth } from "@/lib/api/system";
import { getPersonSummary } from "@/lib/api/people";
import { getQuadrant } from "@/lib/api/visuals";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { decodeFilter } from "@/lib/filters/encode";
import { formatMetricValue, formatNumber, formatPercent } from "@/lib/formatters";
import { ClientTimestamp } from "@/components/ClientTimestamp";
import { getMetricLabel, getMetricUnit } from "@/lib/metrics/catalog";
import { getRangeParams, withRangeParams } from "@/lib/people/query";
import type { MetricDelta, PersonCollaborationStat } from "@/lib/types";

const PERSON_METRIC_KEYS = [
    "cycle_time",
    "review_latency",
    "throughput",
    "churn",
    "wip_overlap",
    "blocked_work",
];

const fallbackPersonDeltas: MetricDelta[] = PERSON_METRIC_KEYS.map((metric) => ({
    metric,
    label: getMetricLabel(metric),
    unit: getMetricUnit(metric),
    value: 0,
    delta_pct: 0,
    spark: [],
}));

const getMetricFromEvidenceLink = (link?: string) => {
    if (!link) {
        return null;
    }
    try {
        const url = new URL(link, "http://localhost");
        return url.searchParams.get("metric");
    } catch {
        return null;
    }
};

const toTitleCase = (value: string) =>
    value
        .replace(/[_-]+/g, " ")
        .split(" ")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");

const collectStats = (input?: Record<string, number> | PersonCollaborationStat[]) => {
    if (!input) {
        return [];
    }
    if (Array.isArray(input)) {
        return input.filter((item) => Number.isFinite(item.value));
    }
    return Object.entries(input)
        .filter(([, value]) => typeof value === "number")
        .map(([key, value]) => ({
            label: toTitleCase(key),
            value,
        }));
};

type PersonPageProps = {
    params: Promise<{ person_id: string }>;
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function PersonPage({ params, searchParams }: PersonPageProps) {
    const health = await checkApiHealth();

    const { person_id: personId } = await params;
    const rawParams = (await searchParams) ?? {};
    const { range_days, compare_days } = getRangeParams(rawParams);
    const encodedFilter = Array.isArray(rawParams.f) ? rawParams.f[0] : rawParams.f;
    const filters = encodedFilter ? decodeFilter(encodedFilter) : defaultMetricFilter;
    const quadrantFilters = {
        ...filters,
        time: { range_days, compare_days },
        scope: { level: "developer" as const, ids: [personId] },
    };

    const summary = await fetchOrNull(
        getPersonSummary({ personId, range_days, compare_days }),
        `people/${personId}/summary`,
    );
    const quadrant = await fetchOrNull(
        getQuadrant({
            type: "churn_throughput",
            scope_type: "person",
            scope_id: personId,
            range_days,
            bucket: "week",
        }),
        `people/${personId}/quadrant`,
    );

    const deltas = summary?.deltas?.length ? summary.deltas : fallbackPersonDeltas;
    const placeholderDeltas = !summary?.deltas?.length;
    const person = summary?.person;
    const narrative = summary?.narrative ?? [];
    const workMix = summary?.sections?.work_mix;
    const flowBreakdown = summary?.sections?.flow_breakdown;
    const collaboration = summary?.sections?.collaboration;
    const collaborationStats = [
        ...collectStats(collaboration?.review_load),
        ...collectStats(collaboration?.handoff_points),
    ];
    const flowStages = flowBreakdown?.stages ?? flowBreakdown?.by_stage ?? [];
    const workMixData =
        workMix?.categories?.map((category) => ({
            name: category.name,
            value: category.value,
        })) ?? [];

    const defaultMetric = deltas[0]?.metric ?? "cycle_time";
    const identityCoverageRaw = summary?.identity_coverage_pct;
    const identityCoverage =
        typeof identityCoverageRaw === "number" && identityCoverageRaw <= 1
            ? identityCoverageRaw * 100
            : identityCoverageRaw;
    const coverageLow = typeof identityCoverage === "number" ? identityCoverage < 70 : false;

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <PrimaryNav filters={filters} active="people" />
                <main className="flex min-w-0 flex-1 flex-col gap-8">
                    <header className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                                Individual view
                            </p>
                            <h1 className="mt-2 font-(--font-display) text-3xl">
                                {person?.display_name ?? "Individual metrics"}
                            </h1>
                            <p className="mt-2 text-sm text-(--ink-muted)">
                                This view is scoped to one person.
                            </p>
                            <p className="mt-2 text-sm text-(--ink-muted)">
                                Select a metric to investigate.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-(--ink-muted)">
                                {(person?.identities ?? []).map((identity) => (
                                    <span
                                        key={`${personId}-${identity.provider}-${identity.handle}`}
                                        className="rounded-full border border-(--card-stroke) bg-(--card-70) px-3 py-1"
                                    >
                                        {identity.provider}: {identity.handle}
                                    </span>
                                ))}
                                {person?.active === false && (
                                    <span className="rounded-full border border-(--card-stroke) bg-(--card-70) px-3 py-1">
                                        Inactive
                                    </span>
                                )}
                            </div>
                        </div>
                        <BackLink href="/people" area="People" />
                    </header>

                    {!health.ok && (
                        <div className="rounded-3xl border border-dashed border-amber-400/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
                            Data service unavailable. Metrics will refresh once the API is back.
                        </div>
                    )}

                    <PersonRangeBar rangeDays={range_days} />

                    <section className="grid gap-4 md:grid-cols-3">
                        {deltas.map((delta) => (
                            <MetricCard
                                key={delta.metric}
                                label={delta.label}
                                href={withRangeParams(
                                    `/people/${personId}/metrics/${delta.metric}`,
                                    range_days,
                                    compare_days,
                                )}
                                value={placeholderDeltas ? undefined : delta.value}
                                unit={delta.unit}
                                delta={placeholderDeltas ? undefined : delta.delta_pct}
                                spark={delta.spark}
                                caption="Open metric"
                            />
                        ))}
                    </section>

                    <section>
                        <QuadrantPanel
                            title="Churn × Throughput landscape"
                            description="Operating mode for the selected window in individual scope."
                            data={quadrant}
                            filters={quadrantFilters}
                            emptyState="Quadrant landscape unavailable."
                        />
                    </section>

                    <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                        <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6">
                            <div className="flex items-center justify-between">
                                <h2 className="font-(--font-display) text-2xl">Narrative</h2>
                                <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                    Evidence-linked
                                </span>
                            </div>
                            <div className="mt-4 space-y-3 text-sm text-(--ink-muted)">
                                {narrative.length ? (
                                    narrative.map((item) => {
                                        const metric =
                                            getMetricFromEvidenceLink(item.evidence_link) ??
                                            defaultMetric;
                                        const href = withRangeParams(
                                            `/people/${personId}/metrics/${metric}`,
                                            range_days,
                                            compare_days,
                                        );
                                        return (
                                            <Link
                                                key={item.id}
                                                href={href}
                                                className="block rounded-2xl border border-transparent bg-(--card-60) px-4 py-3 transition hover:border-(--card-stroke)"
                                            >
                                                {item.text}
                                            </Link>
                                        );
                                    })
                                ) : (
                                    <p className="rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-60) px-4 py-3">
                                        Narrative insights will appear once data is ingested.
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="grid gap-4">
                            <div
                                className={`rounded-3xl border border-(--card-stroke) p-5 text-sm ${
                                    coverageLow
                                        ? "bg-amber-50/80 text-amber-900"
                                        : "bg-(--card-80) text-(--ink-muted)"
                                }`}
                            >
                                <p className="text-xs uppercase tracking-[0.15em]">
                                    Identity mapping
                                </p>
                                <p className="mt-2 text-2xl font-semibold">
                                    {typeof identityCoverage === "number"
                                        ? formatPercent(identityCoverage)
                                        : "--"}
                                </p>
                                <p className="mt-2 text-xs">
                                    Attribution accuracy reflects linked accounts.
                                </p>
                            </div>
                            <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5 text-sm text-(--ink-muted)">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs uppercase tracking-[0.15em]">Freshness</p>
                                    <ClientTimestamp
                                        value={summary?.freshness.last_ingested_at}
                                        className="text-xs uppercase tracking-[0.2em]"
                                    />
                                </div>
                                <div className="mt-3 grid gap-2 text-xs">
                                    {summary?.freshness.sources ? (
                                        Object.entries(summary.freshness.sources).map(
                                            ([key, value]) => (
                                                <div
                                                    key={key}
                                                    className="flex items-center justify-between rounded-2xl border border-(--card-stroke) bg-(--card-70) px-3 py-2"
                                                >
                                                    <span className="uppercase tracking-[0.2em]">
                                                        {key}
                                                    </span>
                                                    <span className="font-semibold text-foreground">
                                                        {value}
                                                    </span>
                                                </div>
                                            ),
                                        )
                                    ) : (
                                        <div className="rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-60) px-3 py-2">
                                            Freshness details pending.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="grid gap-6 lg:grid-cols-3">
                        <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
                            <div className="flex items-center justify-between">
                                <h2 className="font-(--font-display) text-xl">Work mix</h2>
                                <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                    Categories
                                </span>
                            </div>
                            <div className="mt-4">
                                {workMixData.length ? (
                                    <DonutChart data={workMixData} height={260} />
                                ) : (
                                    <div className="flex min-h-64 items-center justify-center rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-60) text-sm text-(--ink-muted)">
                                        Work mix data unavailable.
                                    </div>
                                )}
                            </div>
                            <div className="mt-4 space-y-2 text-sm">
                                {(workMix?.categories ?? []).map((category) => (
                                    <div
                                        key={category.key}
                                        className="flex items-center justify-between rounded-2xl border border-(--card-stroke) bg-(--card-70) px-3 py-2"
                                    >
                                        <span>{category.name}</span>
                                        <span className="text-xs text-(--ink-muted)">
                                            {formatNumber(category.value)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
                            <div className="flex items-center justify-between">
                                <h2 className="font-(--font-display) text-xl">Flow breakdown</h2>
                                <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                    Stages
                                </span>
                            </div>
                            <div className="mt-4">
                                {flowStages.length ? (
                                    <HorizontalBarChart
                                        categories={flowStages.map((stage) => stage.stage)}
                                        values={flowStages.map((stage) => stage.value)}
                                    />
                                ) : (
                                    <div className="flex min-h-60 items-center justify-center rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-60) text-sm text-(--ink-muted)">
                                        Flow stage detail unavailable.
                                    </div>
                                )}
                            </div>
                            <div className="mt-4 space-y-2 text-sm">
                                {flowStages.map((stage) => (
                                    <div
                                        key={stage.stage}
                                        className="flex items-center justify-between rounded-2xl border border-(--card-stroke) bg-(--card-70) px-3 py-2"
                                    >
                                        <span>{stage.stage}</span>
                                        <span className="text-xs text-(--ink-muted)">
                                            {stage.unit
                                                ? formatMetricValue(stage.value, stage.unit)
                                                : formatNumber(stage.value)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
                            <div className="flex items-center justify-between">
                                <h2 className="font-(--font-display) text-xl">Collaboration</h2>
                                <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                    Counts only
                                </span>
                            </div>
                            <div className="mt-4 space-y-2 text-sm">
                                {collaborationStats.length ? (
                                    collaborationStats.map((stat) => (
                                        <div
                                            key={`${stat.label}-${stat.value}`}
                                            className="flex items-center justify-between rounded-2xl border border-(--card-stroke) bg-(--card-70) px-3 py-2"
                                        >
                                            <span>{stat.label}</span>
                                            <span className="text-xs text-(--ink-muted)">
                                                {formatNumber(stat.value)}
                                            </span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-60) px-3 py-3 text-sm text-(--ink-muted)">
                                        Collaboration counts pending.
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    <section className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6">
                        <div className="flex items-center justify-between">
                            <h2 className="font-(--font-display) text-xl">View metric</h2>
                            <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                Individual detail
                            </span>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                            {PERSON_METRIC_KEYS.map((metric) => (
                                <Link
                                    key={metric}
                                    href={withRangeParams(
                                        `/people/${personId}/metrics/${metric}`,
                                        range_days,
                                        compare_days,
                                    )}
                                    className="flex items-center justify-between rounded-2xl border border-(--card-stroke) bg-card px-4 py-3 text-sm"
                                >
                                    <span>{getMetricLabel(metric)}</span>
                                    <span className="text-xs uppercase tracking-[0.2em] text-(--accent-2)">
                                        Open
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </section>
                </main>
            </div>
        </div>
    );
}
