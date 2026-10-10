import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { appPath } from "@/lib/navigation/appPath";

import { DataNote } from "@/components/charts/DataNote";
import { BlockedWorkEvidence, BlockedWorkItemsTable } from "./BlockedWorkEvidence";
import { metricCardProps } from "@/lib/metrics/metricDisplay";
import { associationMeterRows, contributorMeterRows } from "@/components/metrics/associationRows";
import { MeterRows } from "@/components/ui/MeterRows";
import { safeReturnTo } from "@/lib/onboarding/returnTo";
import { EvidenceFact, EvidenceFactList, NOT_REPORTED } from "@/components/evidence/EvidenceFacts";
import { MetricCard } from "@/components/metrics/MetricCard";
import { withRepoScopeNote } from "@/lib/metrics/repoScope";
import { MetricEvidenceButton } from "@/components/metrics/MetricEvidenceButton";
import { MetricStrip } from "@/components/metrics/MetricStrip";
import { ReadTheSignal } from "@/components/metrics/ReadTheSignal";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { buttonClassName } from "@/components/shared/Button";
import { PageHeaderEvidenceAction } from "@/components/shell/PageHeaderEvidenceAction";
import { Notice } from "@/components/ui/Notice";
import { Section } from "@/components/ui/Section";
import { getCurrentOrg } from "@/lib/admin/server";
import { checkApiHealth } from "@/lib/api/system";
import { boundedRead } from "@/lib/serverDeadline";
import { getExplainOutcome, getHomeData } from "@/lib/api/home";
import { getBlockedWorkIssues, getDrilldown } from "@/lib/api/investment";
import { fetchFilterNames } from "@/lib/api/filterOptions";
import { developerNames, repoNames, scopeNames } from "@/lib/filters/scopeNames";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { formatNumber, formatTimestamp } from "@/lib/formatters";
import { CTA_LABELS } from "@/lib/design/cta";
import { getMetricLabel, getMetricPolarity } from "@/lib/metrics/catalog";
import { METRIC_TABS } from "@/lib/metrics/metricTabs";
import { metricEvidenceLeaf } from "@/lib/navigation/evidenceTrail";
import { getTabSet, tabHref } from "@/lib/navigation/tabs";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";
import { filtersFromPageParams } from "@/components/shell/scopeBarConfig";

const getItemTitle = (item: Record<string, unknown>, index: number) => {
    const title =
        item.title ??
        item.name ??
        (typeof item.number === "number" ? `PR #${item.number}` : null) ??
        `Item ${index + 1}`;
    return String(title);
};

type EvidenceField = {
    key: string;
    label: string;
    format?: (value: unknown) => string | null;
};

const formatDateField = (value: unknown) =>
    typeof value === "string" && value.length ? formatTimestamp(value) : null;

const formatNumberField = (value: unknown) =>
    typeof value === "number" ? formatNumber(value) : null;

const EVIDENCE_FIELDS: EvidenceField[] = [
    {
        key: "number",
        label: "Pull request",
        format: (value) => (typeof value === "number" ? `#${formatNumber(value)}` : null),
    },
    { key: "state", label: "State" },
    { key: "status", label: "Status" },
    { key: "author_login", label: "Author" },
    { key: "author", label: "Author" },
    { key: "repo_name", label: "Repository" },
    { key: "repository", label: "Repository" },
    { key: "team", label: "Team" },
    { key: "assignee", label: "Assignee" },
    { key: "priority", label: "Priority" },
    { key: "type", label: "Type" },
    { key: "created_at", label: "Created", format: formatDateField },
    { key: "updated_at", label: "Updated", format: formatDateField },
    { key: "merged_at", label: "Merged", format: formatDateField },
    { key: "closed_at", label: "Closed", format: formatDateField },
    { key: "additions", label: "Additions", format: formatNumberField },
    { key: "deletions", label: "Deletions", format: formatNumberField },
    { key: "changed_files", label: "Changed files", format: formatNumberField },
];

const getEvidenceDetails = (item: Record<string, unknown>) =>
    EVIDENCE_FIELDS.flatMap(({ key, label, format }) => {
        const value = item[key];
        if (value === undefined || value === null || value === "") {
            return [];
        }
        const formatted = format
            ? format(value)
            : Array.isArray(value)
              ? value.filter(Boolean).join(", ")
              : typeof value === "boolean"
                ? value
                    ? "Yes"
                    : "No"
                : String(value);
        return formatted ? [{ label, value: formatted }] : [];
    }).slice(0, 6);

const getItemHref = (item: Record<string, unknown>, fallback: string) => {
    const candidates = [item.url, item.link, item.html_url, item.web_url, item.api_url];
    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.length) {
            return candidate;
        }
    }
    return fallback;
};

/**
 * Where "Return to investigation" goes when the URL carries no usable `origin`: the Flow tab whose
 * headline metric this is, else the first tab that shows it, else the Flow page.
 */
const investigationPath = (metric: string): string => {
    const tab =
        METRIC_TABS.find((entry) => entry.highlight === metric) ??
        METRIC_TABS.find((entry) => entry.metrics.includes(metric));
    return tab ? tabHref(getTabSet("metrics"), tab.id) : "/metrics";
};

const BLOCKED_WORK_MARKER = "blocked";

/**
 * `how.blocked` is intentionally outside the shared URL filter. This explicit
 * marker makes a table link choose the endpoint-specific POST client instead.
 */
const blockedWorkTableHref = (
    filters: Parameters<typeof buildExploreUrl>[0]["filters"],
    role?: string,
) => {
    const url = new URL(
        buildExploreUrl({
            metric: "blocked_work",
            api: "/api/v1/drilldown/issues",
            filters,
            role,
        }),
        "http://localhost",
    );
    url.searchParams.set(BLOCKED_WORK_MARKER, "true");
    return `${url.pathname}${url.search}`;
};

type ExplorePageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Explore({ searchParams }: ExplorePageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;
    const originParam = Array.isArray(params.origin) ? params.origin[0] : params.origin;
    // The page the reader came from, accepted only as an internal path ("/…", not "//…", no
    // scheme, no backslash or control character). Anything else falls back to the Flow tab.
    const servedOrigin = safeReturnTo(originParam);

    const filters = filtersFromPageParams(encodedFilter, params, { view: "explore" });

    const metric = (params.metric as string) ?? "cycle_time";
    const apiParam = (Array.isArray(params.api) ? params.api[0] : params.api) ?? "";
    const apiUrl = apiParam
        ? new URL(apiParam, "http://localhost")
        : new URL("/api/v1/explain", "http://localhost");
    const endpoint = apiUrl.pathname || "/api/v1/explain";
    const metricFromApi = apiUrl.searchParams.get("metric") ?? metric;
    const blockedMarker = Array.isArray(params[BLOCKED_WORK_MARKER])
        ? params[BLOCKED_WORK_MARKER][0]
        : params[BLOCKED_WORK_MARKER];
    // The marker only affects this endpoint. It never enters MetricFilter or its URL encoding.
    const isBlockedWorkTable = endpoint === "/api/v1/drilldown/issues" && blockedMarker === "true";
    const isBlockedWork = endpoint === "/api/v1/explain" && metricFromApi === "blocked_work";

    // Build the view-specific data promise so it runs in parallel with the health check.
    type ExplainResult = Awaited<ReturnType<typeof getExplainOutcome>> | null;
    type DrilldownResult = Awaited<ReturnType<typeof getDrilldown>> | null;
    type BlockedWorkIssuesResult = Awaited<ReturnType<typeof getBlockedWorkIssues>> | null;
    type BlockedWorkEvidenceResult = {
        explain: ExplainResult;
        issues: BlockedWorkIssuesResult;
    };
    type HomeResult = Awaited<ReturnType<typeof getHomeData>> | null;

    let view: "explain" | "drilldown" | "blocked-drilldown" | "home" | "unknown";
    let dataPromise: Promise<
        | ExplainResult
        | DrilldownResult
        | BlockedWorkIssuesResult
        | BlockedWorkEvidenceResult
        | HomeResult
        | null
    >;

    if (endpoint === "/api/v1/drilldown/prs" || endpoint === "/api/v1/drilldown/issues") {
        if (isBlockedWorkTable) {
            view = "blocked-drilldown";
            dataPromise = fetchOrNull(
                getBlockedWorkIssues(filters),
                "explore/blocked-work-items-table",
            );
        } else {
            view = "drilldown";
            dataPromise = fetchOrNull(
                getDrilldown(
                    endpoint as "/api/v1/drilldown/prs" | "/api/v1/drilldown/issues",
                    filters,
                ),
                `explore/drilldown-${endpoint}`,
            );
        }
    } else if (endpoint === "/api/v1/home") {
        view = "home";
        dataPromise = fetchOrNull(getHomeData(filters), "explore/home-data");
    } else if (endpoint === "/api/v1/explain") {
        view = "explain";
        dataPromise = isBlockedWork
            ? Promise.all([
                  fetchOrNull(
                      getExplainOutcome({ metric: metricFromApi, filters }),
                      `explore/explain-${metricFromApi}`,
                  ),
                  fetchOrNull(getBlockedWorkIssues(filters), "explore/blocked-work-items"),
              ]).then(([explain, issues]) => ({ explain, issues }))
            : fetchOrNull(
                  getExplainOutcome({ metric: metricFromApi, filters }),
                  `explore/explain-${metricFromApi}`,
              );
    } else {
        view = "unknown";
        dataPromise = Promise.resolve(null);
    }

    // Run health check, data fetch and the organization name in parallel.
    const [health, rawResult, orgResult] = await Promise.all([
        checkApiHealth(),
        dataPromise,
        boundedRead(getCurrentOrg(), "step current org").catch(() => ({ data: undefined })),
    ]);
    const orgName = orgResult?.data?.name || undefined;

    if (!health.ok) {
        return <ServiceUnavailable landmark={false} />;
    }

    const blockedWorkEvidence = isBlockedWork ? (rawResult as BlockedWorkEvidenceResult) : null;
    const explainOutcome =
        view === "explain"
            ? isBlockedWork
                ? (blockedWorkEvidence?.explain ?? null)
                : (rawResult as ExplainResult)
            : null;
    const data = explainOutcome?.data ?? null;
    // The metric has no explain view (not a failure, not an empty window): say so.
    const noEvidenceView = explainOutcome?.noView === true;
    const drilldown = view === "drilldown" ? (rawResult as DrilldownResult) : null;
    const blockedIssues = isBlockedWork
        ? (blockedWorkEvidence?.issues ?? null)
        : view === "blocked-drilldown"
          ? (rawResult as BlockedWorkIssuesResult)
          : null;
    const home = view === "home" ? (rawResult as HomeResult) : null;

    const metricLabel = data?.label ?? getMetricLabel(metricFromApi);
    const sourceLabel =
        view === "drilldown"
            ? "Evidence drilldown"
            : view === "blocked-drilldown"
              ? "Blocked work items"
              : view === "home"
                ? "Home summary"
                : "Metric explanation";
    // Names, never ids: the same names as the scope bar (CHAOS-9145).
    const hasNamedIds =
        filters.scope.ids.length > 0 ||
        (filters.what.repos?.length ?? 0) > 0 ||
        (filters.who.developers?.length ?? 0) > 0;
    const filterNames = hasNamedIds
        ? await fetchFilterNames()
        : { teams: {}, repos: {}, developers: {} };
    const scopeNameList = scopeNames(filters.scope.level, filters.scope.ids, filterNames);
    const scopeDetail = filters.scope.ids.length
        ? scopeNameList.join(", ")
        : `all ${filters.scope.level}s`;
    const categoryParam = Array.isArray(params.category) ? params.category[0] : params.category;
    const streamParam = Array.isArray(params.stream) ? params.stream[0] : params.stream;
    const breakdownParam = Array.isArray(params.breakdown) ? params.breakdown[0] : params.breakdown;

    const developers = filters.who.developers ?? [];
    const repos = filters.what.repos ?? [];
    const workCategory = filters.why.work_category ?? [];

    // The active filters a query reads, one fact row each (were chips). Removed filters are not
    // shown (CHAOS-7799).
    const filterFacts: Array<{ label: string; value: string }> = [
        {
            label: "Scope",
            value: filters.scope.ids.length
                ? `${filters.scope.level}: ${scopeNameList.join(", ")}`
                : filters.scope.level,
        },
        developers.length
            ? { label: "Developers", value: developerNames(developers, filterNames).join(", ") }
            : null,
        repos.length
            ? { label: "Repositories", value: repoNames(repos, filterNames).join(", ") }
            : null,
        workCategory.length ? { label: "Work type", value: workCategory.join(", ") } : null,
        categoryParam ? { label: "Category", value: categoryParam } : null,
        streamParam ? { label: "Stream", value: streamParam } : null,
        breakdownParam ? { label: "Breakdown", value: breakdownParam } : null,
    ].filter((fact): fact is { label: string; value: string } => fact !== null);

    const drivers = (data?.drivers ?? []).slice(0, 5);
    const contributors = (data?.contributors ?? []).slice(0, 5);
    const explanation =
        view === "drilldown"
            ? `Evidence table for ${metricLabel} in ${scopeDetail}.`
            : view === "home"
              ? "Snapshot of the Home payload for this scope."
              : `This view explains ${metricLabel} for ${scopeDetail} over the last ${filters.time.range_days} days.`;
    // What "View evidence" explains: a served drilldown when the page shows one, else the metric.
    const evidenceSubject =
        view === "drilldown"
            ? { title: metricLabel, apiUrl: apiParam, filters, role: activeRole }
            : { title: metricLabel, metric: metricFromApi, filters, role: activeRole };

    // "Return to investigation": the served origin (an internal path only), else the metric's Flow tab.
    const returnHref =
        servedOrigin ?? withFilterParam(investigationPath(metricFromApi), filters, activeRole);
    const evidenceLinks = Object.entries(data?.drilldown_links ?? {}).filter(
        ([, link]) =>
            !isBlockedWork ||
            !new URL(link, "http://localhost").pathname.startsWith("/api/v1/drilldown/issues"),
    );

    const contextCard = (
        <Section
            data-testid="explore-context"
            title="Context"
            description={explanation}
            className="text-sm"
        >
            <EvidenceFactList aria-label="Context" testId="explore-context-facts">
                <EvidenceFact label="Metric" value={metricLabel} />
                <EvidenceFact label="Organization" value={orgName} />
                <EvidenceFact label="Window" value={`${filters.time.range_days} days`} />
                <EvidenceFact
                    label="Compared with"
                    value={`the previous ${filters.time.compare_days} days`}
                />
                {filterFacts.map((fact) => (
                    <EvidenceFact key={fact.label} label={fact.label} value={fact.value} />
                ))}
                <EvidenceFact label="Source" value={sourceLabel} />
            </EvidenceFactList>
            <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link
                    href={returnHref}
                    data-testid="explore-return"
                    className={buttonClassName("primary", "md")}
                >
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                    {CTA_LABELS.returnToInvestigation}
                </Link>
                <Link
                    href={withFilterParam(
                        "/work?tab=flame&mode=cycle_breakdown",
                        filters,
                        activeRole,
                    )}
                    className={buttonClassName("ghost", "md")}
                >
                    {CTA_LABELS.flameDiagram}
                </Link>
                <Link
                    href={withFilterParam("/landscape", filters, activeRole)}
                    className={buttonClassName("ghost", "md")}
                >
                    {CTA_LABELS.landscape}
                </Link>
            </div>
        </Section>
    );

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader
                title={metricLabel}
                trailLeaf={
                    // The page names the metric by the served label (as its title); the top bar has
                    // only the URL, so it uses the catalog label.
                    metricEvidenceLeaf("/explore", { metric, api: apiParam })
                        ? `${metricLabel} evidence`
                        : undefined
                }
                subtitle={
                    isBlockedWork || view === "blocked-drilldown"
                        ? "Evidence table for the selected metric."
                        : "Evidence detail for the selected metric."
                }
                actions={
                    noEvidenceView ? undefined : (
                        <PageHeaderEvidenceAction subject={evidenceSubject} />
                    )
                }
            />

            <ScopeBar view="explore" />

            {isBlockedWork ? (
                <>
                    {/* Prototype `blockedEvidence()`: one tile, then the evidence section. */}
                    <MetricStrip data-testid="explore-metric-tile">
                        <MetricCard
                            label={metricLabel}
                            // The served flags decide the value and the change text (shared rule):
                            // a no-data window shows its text, never the served 0 placeholder.
                            {...(data ? metricCardProps(data) : {})}
                            polarity={getMetricPolarity(metricFromApi)}
                            caption={withRepoScopeNote(
                                "vs previous window",
                                metricFromApi,
                                filters,
                            )}
                            hideTrend
                        />
                    </MetricStrip>
                    <BlockedWorkEvidence
                        label={metricLabel}
                        value={data?.value}
                        unit={data?.unit}
                        rangeDays={filters.time.range_days}
                        blockedIssues={blockedIssues}
                        completeTableHref={blockedWorkTableHref(filters, activeRole)}
                        returnHref={returnHref}
                    />
                </>
            ) : view === "explain" ? (
                <>
                    {/* Static guidance, not a status update: no live region. */}
                    {!noEvidenceView && (
                        <Notice variant="info" live={false} data-testid="explore-notice">
                            <strong className="font-semibold text-foreground">
                                Metric evidence is a full destination as well as a contextual
                                drawer.
                            </strong>{" "}
                            Keep the metric, scope, and source together.
                        </Notice>
                    )}

                    {noEvidenceView && (
                        <Notice variant="info" live={false} data-testid="explore-no-evidence-view">
                            No evidence view for this metric yet.
                        </Notice>
                    )}

                    {noEvidenceView ? (
                        contextCard
                    ) : (
                        <>
                            {/* One tile (prototype `metrics([...], 1)`): the served value and change. */}
                            <MetricStrip data-testid="explore-metric-tile">
                                <MetricCard
                                    label={metricLabel}
                                    // The served flags decide the value and the change text (shared rule):
                                    // a no-data window shows its text, never the served 0 placeholder.
                                    {...(data ? metricCardProps(data) : {})}
                                    polarity={getMetricPolarity(metricFromApi)}
                                    caption={withRepoScopeNote(
                                        "vs previous window",
                                        metricFromApi,
                                        filters,
                                    )}
                                    hideTrend
                                />
                            </MetricStrip>

                            <div
                                data-testid="explore-signal-row"
                                className="grid gap-4.5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start"
                            >
                                <ReadTheSignal
                                    label={metricLabel}
                                    value={data?.value}
                                    unit={data?.unit ?? ""}
                                    deltaPct={data?.delta_pct}
                                    hasData={data?.has_data}
                                    hasPriorData={data?.has_prior_data}
                                />
                                {contextCard}
                            </div>

                            <div
                                data-testid="association-cards"
                                className="grid gap-4.5 lg:grid-cols-2"
                            >
                                <Section
                                    title="Likely associations"
                                    description="Selected-window associations"
                                    action={
                                        <MetricEvidenceButton
                                            subject={{
                                                title: metricLabel,
                                                metric: metricFromApi,
                                                filters,
                                                role: activeRole,
                                            }}
                                            section="Likely associations"
                                        />
                                    }
                                >
                                    {drivers.length ? (
                                        <MeterRows
                                            signed
                                            aria-label="Likely associations"
                                            testId="association-meter-rows"
                                            rows={associationMeterRows(drivers, undefined, {
                                                signed: true,
                                                unit: data?.unit,
                                            })}
                                        />
                                    ) : (
                                        <p className="text-sm text-(--ink-muted)">
                                            Association detail will appear once data is ingested.
                                        </p>
                                    )}
                                    <DataNote>
                                        Association values are percent change in the selected
                                        window; no causal conclusion is added.
                                    </DataNote>
                                </Section>
                                <Section
                                    title="Primary contributors"
                                    description="Where the impact concentrates in this window."
                                    action={
                                        <MetricEvidenceButton
                                            subject={{
                                                title: metricLabel,
                                                metric: metricFromApi,
                                                filters,
                                                role: activeRole,
                                            }}
                                            section="Primary contributors"
                                        />
                                    }
                                >
                                    {contributors.length ? (
                                        <MeterRows
                                            aria-label="Primary contributors"
                                            testId="contributor-meter-rows"
                                            rows={contributorMeterRows(contributors, data?.unit)}
                                        />
                                    ) : (
                                        <p className="text-sm text-(--ink-muted)">
                                            Contributor detail will appear once data is ingested.
                                        </p>
                                    )}
                                </Section>
                            </div>
                        </>
                    )}
                </>
            ) : (
                contextCard
            )}

            {view === "drilldown" && (
                <section className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5">
                    <div className="flex items-center justify-between">
                        <h2 className="font-(--font-display) text-xl">Evidence Table</h2>
                        <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                            {drilldown?.items?.length ?? 0} items
                        </span>
                    </div>
                    <p className="mt-2 text-xs text-(--ink-muted)">
                        Rows link to source artifacts when available.
                    </p>
                    <div className="mt-4 overflow-auto text-xs">
                        <table className="min-w-full border-collapse">
                            <thead className="text-left text-(--ink-muted)">
                                <tr>
                                    <th className="border-b border-(--card-stroke) pb-2">Item</th>
                                    <th className="border-b border-(--card-stroke) pb-2">
                                        Details
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {(drilldown?.items ?? []).map((item, idx) => {
                                    const fallbackHref = buildExploreUrl({
                                        metric: metricFromApi,
                                        filters,
                                        role: activeRole,
                                    });
                                    const href = getItemHref(item, fallbackHref);
                                    const prFlameHref =
                                        typeof item.repo_id === "string" &&
                                        typeof item.number === "number"
                                            ? appPath("/prs/[pr_id]", {
                                                  pr_id: `${item.repo_id}:${item.number}`,
                                              })
                                            : null;
                                    const issueFlameHref =
                                        typeof item.work_item_id === "string"
                                            ? appPath("/issues/[issue_id]", {
                                                  issue_id: item.work_item_id,
                                              })
                                            : null;
                                    const flameHref = prFlameHref ?? issueFlameHref;
                                    const details = getEvidenceDetails(item);
                                    return (
                                        <tr
                                            key={`${href}-${getItemTitle(item, idx)}`}
                                            className="border-b border-(--card-stroke)"
                                        >
                                            <td className="py-2 pr-4 font-medium">
                                                <a href={href} className="block text-foreground">
                                                    {getItemTitle(item, idx)}
                                                </a>
                                            </td>
                                            <td className="py-2 text-(--ink-muted)">
                                                <div className="space-y-2">
                                                    {details.length > 0 ? (
                                                        <dl className="grid gap-2 sm:grid-cols-2">
                                                            {details.map((detail) => (
                                                                <div
                                                                    key={`${detail.label}-${detail.value}`}
                                                                >
                                                                    <dt className="text-xs uppercase tracking-[0.18em] text-(--ink-muted)">
                                                                        {detail.label}
                                                                    </dt>
                                                                    <dd className="mt-1 text-foreground">
                                                                        {detail.value}
                                                                    </dd>
                                                                </div>
                                                            ))}
                                                        </dl>
                                                    ) : (
                                                        <p>
                                                            Evidence details unavailable for this
                                                            row.
                                                        </p>
                                                    )}
                                                    {flameHref ? (
                                                        <Link
                                                            href={flameHref}
                                                            prefetch={false}
                                                            className="inline-flex items-center rounded-full border border-(--card-stroke) bg-(--card) px-3 py-1 text-xs uppercase tracking-[0.2em] text-(--accent-2)"
                                                        >
                                                            {CTA_LABELS.openArtifact}
                                                        </Link>
                                                    ) : null}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {view === "blocked-drilldown" && (
                <section
                    data-testid="blocked-work-complete-table-view"
                    className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5"
                >
                    <div className="flex items-center justify-between">
                        <h2 className="font-(--font-display) text-xl">Blocked work items</h2>
                        <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                            {blockedIssues
                                ? `${formatNumber(blockedIssues.items.length)} of ${formatNumber(blockedIssues.count)}`
                                : NOT_REPORTED}
                        </span>
                    </div>
                    {blockedIssues && blockedIssues.count > blockedIssues.items.length ? (
                        <p className="mt-2 text-xs text-(--ink-muted)">
                            The service returned the first{" "}
                            {formatNumber(blockedIssues.items.length)} of{" "}
                            {formatNumber(blockedIssues.count)} items. It does not serve another
                            page.
                        </p>
                    ) : (
                        <p className="mt-2 text-xs text-(--ink-muted)">
                            Item identity and status are served for the selected scope. No duration
                            is added here.
                        </p>
                    )}
                    <BlockedWorkItemsTable
                        blockedIssues={blockedIssues}
                        tableTestId="blocked-work-complete-table"
                    />
                </section>
            )}

            {view === "home" && (
                <section className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5">
                    <h2 className="font-(--font-display) text-xl">Home Snapshot</h2>
                    <p className="mt-3 text-sm text-(--ink-muted)">
                        This endpoint powers Home. Open Home for the curated summary.
                    </p>
                    <pre className="mt-4 max-h-64 overflow-auto rounded-2xl border border-(--card-stroke) bg-(--card-60) px-4 py-3 text-xs text-(--ink-muted)">
                        {JSON.stringify(home ?? {}, null, 2)}
                    </pre>
                </section>
            )}

            {view === "unknown" && (
                <section className="rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-70) p-5 text-sm text-(--ink-muted)">
                    Unsupported endpoint. Provide a metric or a supported drilldown API.
                </section>
            )}

            {/* Not drawn in the prototype, and the drawer does not list these links: kept, last. */}
            {view === "explain" && !noEvidenceView && (
                <Section
                    data-testid="evidence-shortcuts"
                    title="Evidence shortcuts"
                    description="Evidence links stay in this scope."
                >
                    <div className="flex flex-wrap gap-2 text-sm">
                        {evidenceLinks.map(([label, link]) => (
                            <Link
                                key={label}
                                href={buildExploreUrl({
                                    api: link,
                                    filters,
                                    role: activeRole,
                                })}
                                className={buttonClassName("secondary", "sm")}
                            >
                                {label}
                            </Link>
                        ))}
                        {!evidenceLinks.length && (
                            <p className="text-sm text-(--ink-muted)">
                                Evidence links will appear once data is ingested.
                            </p>
                        )}
                    </div>
                </Section>
            )}
        </div>
    );
}
