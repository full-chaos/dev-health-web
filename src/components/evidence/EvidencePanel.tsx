"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { getExplainData } from "@/lib/api/home";
import { ValidationErrors } from "@/lib/constants/errors";
import { logger } from "@/lib/logger";
import { MetricFilter } from "@/lib/filters/types";
import {
    Contributor,
    ExplainRepository,
    HomeResponse,
    InvestmentResponse,
    OpportunitiesResponse,
} from "@/lib/types";
import { EvidenceDrawerShell } from "./EvidenceDrawerShell";
import { EvidenceFact, EvidenceFactList, EvidenceProvenanceFacts } from "./EvidenceFacts";
import { EvidenceItems, type EvidenceItem } from "./EvidenceItems";
import { EvidenceRepositories, EvidenceSourceLink } from "./EvidenceRepositories";
import { SuggestedActions } from "./SuggestedActions";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClassName } from "@/components/shared/Button";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { CTA_LABELS } from "@/lib/design/cta";
import { STATUS_PILL } from "@/lib/statusPill";
import { getMetricDefinition } from "@/lib/metrics/definitions";
import { formatDelta, formatNumber, formatPercent as formatDisplayPercent } from "@/lib/formatters";
import { scrubIdentifiers } from "@/lib/labels/entityLabel";
import Link from "next/link";

type EvidenceProvenance = {
    last_sync?: string | null;
    source?: string | null;
    identity_confidence?: number | null;
    quality?: string | null;
    partial?: boolean;
};

type Action = {
    id: string;
    label: string;
    type: "experiment" | "process" | "tooling";
};

type EvidencePanelData = {
    metric?: string;
    label?: string;
    /** Served by the explain endpoint; shown as the "Value" row. */
    value?: number;
    unit?: string;
    /** Served by the explain endpoint; shown as the "Change" row. */
    delta_pct?: number;
    /** A summary the API served. The web builds none. */
    summary?: string;
    why_it_matters?: string;
    evidence: EvidenceItem[];
    actions: Action[];
    provenance?: EvidenceProvenance;
    /** Served by explain for a repository-stored metric (CHAOS-8103); null = not stored per repository. */
    repositories?: ExplainRepository[] | null;
    /** Served by explain for a one-repository scope: the provider page (https). */
    source_url?: string | null;
};

type EvidencePanelResult = Partial<EvidencePanelData> & {
    unit?: string;
    drivers?: Contributor[];
    contributors?: Contributor[];
    last_sync?: string | null;
    source?: string | null;
    identity_confidence?: number | null;
};

const formatPercent = (value?: number | null) =>
    typeof value === "number" ? formatDisplayPercent(value) : "not available";

const safeNarrative = (value: string) => scrubIdentifiers(value).text;

const humanizeKey = (value: string) =>
    value
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");

const threadFromApiUrl = (apiUrl?: string) => {
    if (!apiUrl) return undefined;
    try {
        const url = new URL(
            apiUrl,
            typeof window === "undefined" ? "http://localhost" : window.location.origin,
        );
        return url.searchParams.get("thread") ?? undefined;
    } catch {
        return undefined;
    }
};

type FetchableEvidenceResult =
    EvidencePanelResult | HomeResponse | InvestmentResponse | OpportunitiesResponse;

const isHomeResponse = (result: FetchableEvidenceResult): result is HomeResponse =>
    "freshness" in result && "tiles" in result && "constraint" in result;

const isInvestmentResponse = (result: FetchableEvidenceResult): result is InvestmentResponse =>
    "theme_distribution" in result && "subcategory_distribution" in result;

const isOpportunitiesResponse = (
    result: FetchableEvidenceResult,
): result is OpportunitiesResponse => "items" in result && Array.isArray(result.items);

const normalizeHomeEvidence = (
    result: HomeResponse,
    apiUrl: string | undefined,
    title: string,
): EvidencePanelResult => {
    const thread = threadFromApiUrl(apiUrl);
    const coverage = result.freshness.coverage;
    // No sentence when the coverage is not served: a missing coverage is never written as 0%.
    const coverageSummary = coverage
        ? `Repository coverage ${formatPercent(coverage.repos_covered_pct)}, linked PR coverage ${formatPercent(coverage.prs_linked_to_issues_pct)}, cycle-state coverage ${formatPercent(coverage.issues_with_cycle_states_pct)}.`
        : "";
    const summaryText = result.summary.map((sentence) => sentence.text).join(" ");
    const evidence: EvidenceItem[] = [
        ...result.summary.map((sentence) => ({
            id: sentence.id,
            title: sentence.text,
            url: sentence.evidence_link,
            type: "other" as const,
            meta: "Home summary",
        })),
        ...result.constraint.evidence.map((item, index) => ({
            id: `constraint-${index}`,
            title: item.label,
            url: item.link,
            type: "other" as const,
            meta: result.constraint.title,
        })),
        ...result.events.map((event, index) => ({
            id: `event-${index}`,
            title: event.text,
            url: event.link,
            type: "other" as const,
            meta: event.type,
        })),
    ];

    return {
        label: title,
        summary:
            thread === "measure"
                ? coverageSummary
                : result.health_state?.summary ||
                  summaryText ||
                  result.constraint.claim ||
                  coverageSummary,
        why_it_matters:
            thread === "measure"
                ? result.data_confidence?.caveats.join(" ") ||
                  "Coverage and freshness determine how much context Home can safely explain."
                : result.constraint.claim ||
                  "This context comes from the same Home payload that ranks current operating signals.",
        evidence,
        actions: result.constraint.experiments.map((experiment, index) => ({
            id: `experiment-${index}`,
            label: experiment,
            type: "experiment" as const,
        })),
        // Served fields only. The Home response serves no source name; "Last sync" is the last
        // successful sync, as on the Home card (an ingest time is not a sync).
        provenance: {
            last_sync: result.freshness.latest_successful_sync_at ?? null,
            quality: result.data_confidence?.level ?? null,
            partial: evidence.length === 0,
        },
    };
};

const normalizeInvestmentEvidence = (
    result: InvestmentResponse,
    title: string,
): EvidencePanelResult => {
    // The served share of each theme is one row: theme left, share right, in the served order of
    // size. The web writes no sentence about them (no "largest theme" statement).
    const themes = Object.entries(result.theme_distribution).sort(([, a], [, b]) => b - a);
    const evidence = themes.map(([theme, share]) => ({
        id: `theme-${theme}`,
        title: humanizeKey(theme),
        url: "/investment",
        type: "other" as const,
        value: formatPercent(share * 100),
    }));

    return {
        label: title,
        why_it_matters:
            "Investment mix context explains where effort is actually being spent, using persisted WorkUnit distributions.",
        evidence,
        // The Investment response serves no action, so the drawer shows none.
        actions: [],
        // The Investment response serves no source name and no quality word for this block.
        provenance: { partial: evidence.length === 0 },
    };
};

const normalizeOpportunitiesEvidence = (
    result: OpportunitiesResponse,
    title: string,
): EvidencePanelResult => {
    const evidence = result.items.flatMap((item) =>
        item.evidence_links.map((link, index) => ({
            id: `${item.id}-${index}`,
            title: item.title,
            url: link,
            type: "other" as const,
            meta: item.rationale,
        })),
    );
    const actions = result.items.flatMap((item) =>
        item.suggested_experiments.map((experiment, index) => ({
            id: `${item.id}-experiment-${index}`,
            label: experiment,
            type: "experiment" as const,
        })),
    );

    return {
        label: title,
        summary: result.items.length
            ? `${result.items.length} ${result.items.length === 1 ? "opportunity" : "opportunities"} matched the selected context.`
            : "No opportunities matched the selected context yet.",
        why_it_matters:
            "Opportunity context connects the investigation thread to the next reversible operating experiment.",
        evidence,
        actions,
        // The Opportunities response serves no source name and no quality word.
        provenance: { partial: evidence.length === 0 },
    };
};

const normalizeFetchedEvidence = (
    result: FetchableEvidenceResult | null,
    apiUrl: string | undefined,
    title: string,
): EvidencePanelResult | null => {
    if (!result) return null;
    if (isHomeResponse(result)) return normalizeHomeEvidence(result, apiUrl, title);
    if (isInvestmentResponse(result)) return normalizeInvestmentEvidence(result, title);
    if (isOpportunitiesResponse(result)) return normalizeOpportunitiesEvidence(result, title);
    return result;
};

const isEvidenceDebugEnabled = () =>
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_DEV_HEALTH_EVIDENCE_DEBUG === "true";

const explainMetricFromApiUrl = (apiUrl?: string) => {
    if (!apiUrl) return undefined;
    try {
        const url = new URL(
            apiUrl,
            typeof window === "undefined" ? "http://localhost" : window.location.origin,
        );
        if (url.pathname !== "/api/v1/explain") return undefined;
        return url.searchParams.get("metric") ?? undefined;
    } catch {
        return undefined;
    }
};

const evidenceDestination = (params: {
    apiUrl?: string;
    metric?: string;
    filters: MetricFilter;
    role?: string;
    origin?: string;
}) => {
    const { role, origin } = params;
    if (params.metric) {
        return buildExploreUrl({ metric: params.metric, filters: params.filters, role, origin });
    }
    if (!params.apiUrl) return "#";

    try {
        const url = new URL(
            params.apiUrl,
            typeof window === "undefined" ? "http://localhost" : window.location.origin,
        );
        if (url.pathname === "/api/v1/investment") {
            return withFilterParam("/investment", params.filters, role, origin);
        }
        if (url.pathname === "/api/v1/opportunities") {
            return withFilterParam("/opportunities", params.filters, role, origin);
        }
    } catch {
        return buildExploreUrl({ api: params.apiUrl, filters: params.filters, role, origin });
    }

    return buildExploreUrl({ api: params.apiUrl, filters: params.filters, role, origin });
};

const readJsonOrEmpty = async <T,>(response: Response): Promise<T | null> => {
    // Real fetch Responses always expose text(); some test doubles only provide
    // json(). Fall back to json() so both real Responses and realistic mocks work.
    if (typeof response.text !== "function") {
        return (await response.json()) as T;
    }
    const text = await response.text();
    const trimmed = text.trim();
    return trimmed ? (JSON.parse(trimmed) as T) : null;
};

export type EvidencePanelProps = {
    isOpen: boolean;
    onCloseAction: () => void;
    title: string;
    apiUrl?: string;
    metric?: string;
    filters: MetricFilter;
    /** The active lens role. It is kept in the footer link (Explore and the other destinations). */
    role?: string;
    /** A return-path hint: added to the footer link as the `origin` query parameter. */
    origin?: string;
    /** The opener's own content for the subject. Shown first, in every state (loading, error, data). */
    intro?: ReactNode;
};

export function EvidencePanel({
    isOpen,
    onCloseAction,
    title,
    apiUrl,
    metric,
    filters,
    role,
    origin,
    intro,
}: EvidencePanelProps) {
    const [data, setData] = useState<EvidencePanelData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [errorDetail, setErrorDetail] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && (apiUrl || metric)) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- opening the panel intentionally starts async evidence loading.
            setLoading(true);
            setError(null);
            setErrorDetail(null);

            const fetchData = async () => {
                let requestPath = apiUrl ?? "/api/v1/explain";
                try {
                    let result: EvidencePanelResult | null | undefined;
                    if (apiUrl) {
                        // apiUrl wins: a populated evidence_ref must drive the panel.
                        // Route /api/v1/explain URLs through the typed, cached client;
                        // fetch all other evidence_ref endpoints directly.
                        const apiExplainMetric = explainMetricFromApiUrl(apiUrl);
                        if (apiExplainMetric) {
                            requestPath = "/api/v1/explain";
                            result = await getExplainData({
                                metric: apiExplainMetric,
                                filters,
                            });
                        } else {
                            const res = await fetch(apiUrl);
                            if (!res.ok) throw new Error(ValidationErrors.FailedToFetchEvidence);
                            const fetched = await readJsonOrEmpty<FetchableEvidenceResult>(res);
                            result = normalizeFetchedEvidence(fetched, apiUrl, title);
                        }
                    } else if (metric) {
                        requestPath = "/api/v1/explain";
                        result = await getExplainData({
                            metric,
                            filters,
                        });
                    }

                    if (result) {
                        const metricKey = result.metric || metric;
                        const definition = metricKey ? getMetricDefinition(metricKey) : undefined;

                        // A served contributor is one row: its served name left, its served
                        // value (with the unit of the payload) and served change right.
                        const unit = result.unit ? ` ${result.unit}` : "";
                        const rawEvidence: EvidenceItem[] =
                            result.evidence ||
                            [...(result.drivers || []), ...(result.contributors || [])].map(
                                (d: Contributor) => ({
                                    id: d.id,
                                    title: d.display_name || d.label,
                                    url: d.evidence_link || "#",
                                    type: "other" as const,
                                    value: `${formatNumber(d.value)}${unit}`,
                                    valueNote: `(${formatDelta(d.delta_pct)})`,
                                }),
                            );

                        // Deduplicate by id — drivers and contributors overlap
                        const seen = new Set<string>();
                        const evidence = rawEvidence
                            .filter((item) => {
                                if (seen.has(item.id)) return false;
                                seen.add(item.id);
                                return true;
                            })
                            .map((item) => ({
                                ...item,
                                title: safeNarrative(item.title),
                                ...(item.meta ? { meta: safeNarrative(item.meta) } : {}),
                            }));

                        // Served actions only. The metric definition's fixed suggestions are not
                        // served data and are not in the approved drawer.
                        const actions = result.actions || [];

                        // Served fields only: the web names no source and grades no quality. A
                        // field the API did not serve reads "Not reported" in its row.
                        const provenance: EvidenceProvenance = result.provenance || {
                            last_sync: result.last_sync ?? null,
                            source: result.source ?? null,
                            identity_confidence: result.identity_confidence ?? null,
                            quality: null,
                            partial: evidence.length === 0,
                        };

                        // The summary is the served one. The web builds no sentence from the
                        // numbers: the served value and change are rows of their own.
                        const whyItMatters = result.why_it_matters || definition?.whyItMatters;

                        setData({
                            ...result,
                            summary: result.summary ? safeNarrative(result.summary) : undefined,
                            why_it_matters: whyItMatters ? safeNarrative(whyItMatters) : undefined,
                            evidence,
                            actions,
                            provenance,
                        });
                    }
                } catch (err) {
                    const detail = err instanceof Error ? err.message : String(err);
                    if (isEvidenceDebugEnabled()) {
                        logger.error(
                            { err, detail, metric, apiUrl, requestPath, title },
                            "Evidence panel failed to load evidence data",
                        );
                    }
                    setError(
                        "We couldn't load the supporting detail for this selection. This is usually temporary — try again in a moment.",
                    );
                    setErrorDetail(detail);
                } finally {
                    setLoading(false);
                }
            };

            fetchData();
        }
    }, [isOpen, apiUrl, metric, filters, title]);

    if (!isOpen) return null;

    const showDevDiagnostics = isEvidenceDebugEnabled();

    const exploreUrl = evidenceDestination({ apiUrl, metric, filters, role, origin });

    // Nothing inside this panel handles Escape today (links and buttons only); a future inner
    // menu must call `preventDefault()` on its own Escape (see `EvidenceDrawerShell`).
    return (
        <EvidenceDrawerShell
            subject={title}
            onCloseAction={onCloseAction}
            footer={
                <Link
                    href={exploreUrl}
                    // The shared drawer lives in the layout: close it, or it stays open over the
                    // destination when the path does not change (Explore to Explore).
                    onClick={onCloseAction}
                    // Approved footer: one primary button (`.btn.primary`), not a full-width strip;
                    // the icon goes before the text, as the prototype `btn()` draws it.
                    className={buttonClassName("primary", "md")}
                >
                    <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
                    {CTA_LABELS.openEvidence}
                </Link>
            }
        >
            <>
                {intro ? <div data-testid="evidence-intro">{intro}</div> : null}
                {loading ? (
                    <div className="space-y-4 animate-pulse">
                        <div className="h-24 bg-(--card-70) rounded-2xl" />
                        <div className="h-40 bg-(--card-70) rounded-2xl" />
                        <div className="h-32 bg-(--card-70) rounded-2xl" />
                    </div>
                ) : error ? (
                    <div className="space-y-3" data-testid="evidence-error-state">
                        <ErrorCard title="Unable to load this view" message={error} />
                        {showDevDiagnostics && errorDetail ? (
                            <pre
                                data-testid="evidence-error-diagnostics"
                                className="overflow-x-auto whitespace-pre-wrap rounded-2xl border border-(--card-stroke) bg-(--card-90) p-4 text-xs leading-5 text-(--ink-muted)"
                            >
                                {errorDetail}
                            </pre>
                        ) : null}
                    </div>
                ) : data ? (
                    <>
                        {data.summary ? (
                            <p
                                data-testid="evidence-summary"
                                className="text-[0.8125rem] leading-5 text-(--ink-muted)"
                            >
                                {data.summary}
                            </p>
                        ) : null}
                        <EvidenceFacts
                            provenance={data.provenance}
                            artifactCount={data.evidence?.length ?? 0}
                        />
                        <EvidenceMetricFacts
                            value={data.value}
                            unit={data.unit}
                            deltaPct={data.delta_pct}
                        />
                        {data.why_it_matters ? (
                            <div data-testid="evidence-why">
                                <h4 className="text-xs font-semibold text-foreground">
                                    Why this matters
                                </h4>
                                <p className="mt-1 text-xs leading-5 text-(--ink-muted)">
                                    {data.why_it_matters}
                                </p>
                            </div>
                        ) : null}
                        {drawnEvidence(data.evidence, data.repositories)}
                        <EvidenceRepositories repositories={data.repositories} unit={data.unit} />
                        <EvidenceSourceLink url={data.source_url} />
                        <SuggestedActions actions={data.actions || []} />
                    </>
                ) : (
                    <EmptyState
                        title="Nothing to show yet"
                        description="There's no supporting detail to display for this selection right now. Try a different metric or widen the time window."
                    />
                )}
            </>
        </EvidenceDrawerShell>
    );
}

/**
 * The "Supporting evidence" block. A repository-stored metric serves `repositories` from the same
 * rows as its contributors (ops #3775): a row whose id is one of them is drawn once, under
 * "Supporting repositories", not again here (CHAOS-8587, rule C1). Every other row (the drivers,
 * with their served change) stays. The "no contributing artifacts" note is a missing-data note: it
 * shows when nothing was served, whatever `repositories` is. With it null or absent the block is
 * exactly as before.
 */
function drawnEvidence(
    evidence: EvidenceItem[] | undefined,
    repositories?: ExplainRepository[] | null,
) {
    const rows = evidence ?? [];
    // The missing-data note depends on what was SERVED, not on what is left after the filter.
    if (rows.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-90) p-4 text-sm leading-6 text-(--ink-muted)">
                No contributing artifacts were returned for this metric and filter window. This is a
                partial-data state, not a zero signal.
            </div>
        );
    }
    if (!Array.isArray(repositories)) return <EvidenceItems items={rows} />;
    const own = new Set(repositories.map((repo) => repo.id));
    // Draws nothing when every row was a repository (EvidenceItems returns null for an empty list).
    return <EvidenceItems items={rows.filter((row) => !own.has(row.id))} />;
}

/**
 * The served value and change of a metric payload, as two fact rows. A payload that serves
 * neither number gets no block (no row reads a made value).
 */
function EvidenceMetricFacts({
    value,
    unit,
    deltaPct,
}: {
    value?: number;
    unit?: string;
    deltaPct?: number;
}) {
    const hasValue = typeof value === "number" && Number.isFinite(value);
    const hasDelta = typeof deltaPct === "number" && Number.isFinite(deltaPct);
    if (!hasValue && !hasDelta) return null;

    return (
        <EvidenceFactList aria-label="Value and change" testId="evidence-metric-facts">
            <EvidenceFact
                label="Value"
                value={hasValue ? `${formatNumber(value)}${unit ? ` ${unit}` : ""}` : undefined}
            />
            <EvidenceFact label="Change" value={hasDelta ? formatDelta(deltaPct) : undefined} />
        </EvidenceFactList>
    );
}

/** The provenance rows of an explain result, and the partial-data note under them. */
function EvidenceFacts({
    provenance,
    artifactCount,
}: {
    provenance?: EvidenceProvenance;
    artifactCount: number;
}) {
    return (
        <section className="text-xs">
            <EvidenceProvenanceFacts
                source={provenance?.source}
                quality={provenance?.quality}
                lastSync={provenance?.last_sync}
                identityConfidence={provenance?.identity_confidence}
                artifactCount={artifactCount}
            />
            {provenance?.partial && (
                <p className={`mt-3 rounded-xl px-3 py-2 ${STATUS_PILL.caution}`}>
                    Partial evidence: the backend did not return a complete artifact list for this
                    selection.
                </p>
            )}
        </section>
    );
}
