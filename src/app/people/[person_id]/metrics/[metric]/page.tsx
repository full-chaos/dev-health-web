import Link from "next/link";

import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { HeatmapPanel } from "@/components/charts/HeatmapPanel";
import { TimeseriesChart } from "@/components/charts/TimeseriesChart";
import { PersonRangeBar } from "@/components/people/PersonRangeBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { checkApiHealth, getHeatmap, getPersonDrilldown, getPersonMetric, getPersonSummary } from "@/lib/api";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter } from "@/lib/filters/encode";
import { formatNumber } from "@/lib/formatters";
import { getMetricLabel } from "@/lib/metrics/catalog";
import { getRangeParams, withRangeParams } from "@/lib/people/query";

const getItemTitle = (item: Record<string, unknown>, index: number) => {
  const title =
    item.title ??
    item.name ??
    item.work_item_id ??
    item.number ??
    item.id ??
    `Item ${index + 1}`;
  return String(title);
};

const getItemHref = (item: Record<string, unknown>, fallback: string) => {
  const candidates = [
    item.url,
    item.link,
    item.html_url,
    item.web_url,
    item.api_url,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length) {
      return candidate;
    }
  }
  return fallback;
};

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
  keys: string[]
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

export default async function PersonMetricPage({
  params,
  searchParams,
}: PersonMetricPageProps) {
  const health = await checkApiHealth();

  const { person_id: personId, metric } = await params;
  const rawParams = (await searchParams) ?? {};
  const { range_days, compare_days } = getRangeParams(rawParams);
  const encodedFilter = Array.isArray(rawParams.f) ? rawParams.f[0] : rawParams.f;
  const filters = encodedFilter ? decodeFilter(encodedFilter) : defaultMetricFilter;

  const evidenceParam = Array.isArray(rawParams.evidence)
    ? rawParams.evidence[0]
    : rawParams.evidence;
  const evidenceType = evidenceParam === "prs" || evidenceParam === "issues"
    ? evidenceParam
    : null;
  const limitParam = Array.isArray(rawParams.limit)
    ? rawParams.limit[0]
    : rawParams.limit;
  const limit = limitParam ? Math.max(1, Number(limitParam)) : 50;
  const cursorParam = Array.isArray(rawParams.cursor)
    ? rawParams.cursor[0]
    : rawParams.cursor;

  const [summary, metricData] = await Promise.all([
    getPersonSummary({ personId, range_days, compare_days }).catch(() => null),
    getPersonMetric({ personId, metric, range_days, compare_days }).catch(
      () => null
    ),
  ]);
  const activeHoursHeatmap = await getHeatmap({
    type: "individual",
    metric: "active_hours",
    scope_type: "person",
    scope_id: personId,
    range_days,
  }).catch(() => null);

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
    ? Object.entries(definition).filter(([, value]) =>
      typeof value === "string" || typeof value === "number" || Array.isArray(value)
    )
    : [];

  const drilldown = evidenceType
    ? await getPersonDrilldown({
      personId,
      type: evidenceType,
      limit,
      cursor: cursorParam ?? undefined,
      metric,
      range_days,
      compare_days,
    }).catch(() => null)
    : null;

  const breakdowns = metricData?.breakdowns ?? {};
  const drivers = metricData?.drivers ?? [];
  const timeseries = metricData?.timeseries ?? [];

  const breakdownGroups = [
    {
      id: "repo",
      label: "By repo",
      items: breakdowns.by_repo?.map((item) => ({
        label: item.repo,
        value: item.value,
      })) ?? [],
    },
    {
      id: "work",
      label: "By work type",
      items: breakdowns.by_work_type?.map((item) => ({
        label: item.work_type,
        value: item.value,
      })) ?? [],
    },
    {
      id: "stage",
      label: "By stage",
      items: breakdowns.by_stage?.map((item) => ({
        label: item.stage,
        value: item.value,
      })) ?? [],
    },
  ];

  const evidenceHref = (type: "prs" | "issues") =>
    withRangeParams(
      `/people/${personId}/metrics/${metric}`,
      range_days,
      compare_days,
      { evidence: type, limit }
    );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="people" />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-(--ink-muted)">
                Individual metric
              </p>
              <h1 className="mt-2 font-(--font-display) text-3xl">
                {label}
              </h1>
              <p className="mt-2 text-sm text-(--ink-muted)">
                {person?.display_name ?? "Individual"} • {range_days}d window
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
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={withRangeParams(`/people/${personId}`, range_days, compare_days)}
                className="rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em]"
              >
                Back to individual
              </Link>
            </div>
          </header>

          {!health.ok && (
            <div className="rounded-3xl border border-dashed border-amber-400/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
              Data service unavailable. Evidence will refresh once the API is back.
            </div>
          )}

          <PersonRangeBar rangeDays={range_days} />

          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6">
              <h2 className="font-(--font-display) text-xl">Definition</h2>
              <p className="mt-2 text-sm text-(--ink-muted)">
                {definitionSummary ??
                  "Definition will appear when the signal library is available."}
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
                      className="flex items-center justify-between rounded-2xl border border-(--card-stroke) bg-card px-3 py-2"
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

            <div className="rounded-3xl border border-(--card-stroke) bg-card p-6">
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
                  <div className="flex h-[240px] items-center justify-center rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-60) text-sm text-(--ink-muted)">
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
              emptyState="Active hours heatmap unavailable."
              evidenceTitle="Commit evidence"
            />
          </section>

          <section className="grid gap-6 lg:grid-cols-3">
            {breakdownGroups.map((group) => (
              <div
                key={group.id}
                className="rounded-3xl border border-(--card-stroke) bg-card p-5"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-(--font-display) text-xl">
                    {group.label}
                  </h2>
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
                    <div className="flex h-[220px] items-center justify-center rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-60) text-sm text-(--ink-muted)">
                      No breakdown data.
                    </div>
                  )}
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  {group.items.map((item) => (
                    <div
                      key={`${group.id}-${item.label}`}
                      className="flex items-center justify-between rounded-2xl border border-(--card-stroke) bg-(--card-70) px-3 py-2"
                    >
                      <span>{item.label}</span>
                      <span className="text-xs text-(--ink-muted)">
                        {formatNumber(item.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-(--font-display) text-xl">Associations</h2>
                <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                  Evidence linked
                </span>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                {drivers.length ? (
                  drivers.map((driver, idx) => {
                    const evidence = getEvidenceTypeFromLink(driver.link);
                    const href = evidence ? evidenceHref(evidence) : null;
                    return (
                      <div
                        key={`${driver.text}-${idx}`}
                        className="rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-3"
                      >
                        <p className="text-sm text-foreground">
                          {driver.text}
                        </p>
                        {href && (
                          <Link
                            href={href}
                            className="mt-2 inline-flex text-xs uppercase tracking-[0.2em] text-(--accent-2)"
                          >
                            Open evidence
                          </Link>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-60) px-4 py-3 text-sm text-(--ink-muted)">
                    Association statements will appear once data is ingested.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-(--font-display) text-xl">Evidence</h2>
                <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                  Drilldown
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs uppercase tracking-[0.2em]">
                <Link
                  href={evidenceHref("prs")}
                  className={`rounded-full border px-3 py-2 ${evidenceType === "prs"
                    ? "border-(--accent) bg-(--accent)/15 text-foreground"
                    : "border-(--card-stroke) text-(--ink-muted)"
                    }`}
                >
                  PRs
                </Link>
                <Link
                  href={evidenceHref("issues")}
                  className={`rounded-full border px-3 py-2 ${evidenceType === "issues"
                    ? "border-(--accent) bg-(--accent)/15 text-foreground"
                    : "border-(--card-stroke) text-(--ink-muted)"
                    }`}
                >
                  Issues
                </Link>
              </div>
              {evidenceType && (
                <div className="mt-4 overflow-auto text-xs">
                  <table className="min-w-full border-collapse">
                    <thead className="text-left text-(--ink-muted)">
                      <tr>
                        <th className="border-b border-(--card-stroke) pb-2">
                          Item
                        </th>
                        <th className="border-b border-(--card-stroke) pb-2">
                          Details
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(drilldown?.items ?? []).map((item, idx) => {
                        const fallbackHref = evidenceHref(evidenceType);
                        const href = getItemHref(item, fallbackHref);
                        return (
                          <tr
                            key={`item-${idx}`}
                            className="border-b border-(--card-stroke)"
                          >
                            <td className="py-2 pr-4 font-medium">
                              <a href={href} className="block text-foreground">
                                {getItemTitle(item, idx)}
                              </a>
                            </td>
                            <td className="py-2 text-(--ink-muted)">
                              <a href={href} className="block">
                                {JSON.stringify(item)}
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!drilldown?.items?.length && (
                    <p className="mt-3 text-sm text-(--ink-muted)">
                      Evidence rows will appear once data is ingested.
                    </p>
                  )}
                </div>
              )}
              {!evidenceType && (
                <div className="mt-4 rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-60) px-4 py-3 text-sm text-(--ink-muted)">
                  Choose PRs or Issues to review evidence.
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
