"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { buildThreadApiUrl } from "@/lib/cockpit/evidenceRef";
import { CTA_LABELS } from "@/lib/design/cta";
import { ClientTimestamp } from "@/components/ClientTimestamp";
import { MetricDelta } from "@/components/shared/MetricDelta";
import { DataState } from "@/components/ui/DataState";
import { sortDeltasByRole, getMetricPolarity } from "@/lib/metrics/catalog";
import { formatMetricValue } from "@/lib/formatters";
import { scrubIdentifiers } from "@/lib/labels/entityLabel";
import type { HomeResponse } from "@/lib/types";

import { ThreadRow } from "./ThreadRow";
import type { MetricFilter } from "@/lib/filters/types";

type CockpitClientProps = {
    home: HomeResponse | null;
    filters: MetricFilter;
    activeRole: string;
    /** Extra rows for the Investigation threads list (rendered by the page, after the built-in ones). */
    children?: ReactNode;
};

const THREAD_API_TARGETS: Record<string, string> = {
    understand: "/api/v1/home",
    measure: "/api/v1/home",
    align: "/api/v1/investment",
    execute: "/api/v1/opportunities",
};

const getThreadEvidenceTarget = (
    key: string,
    tile: HomeResponse["tiles"][string],
    filters: MetricFilter,
) => {
    const thread = key.toLowerCase();
    const apiPath = THREAD_API_TARGETS[thread];
    if (apiPath) {
        return { apiUrl: buildThreadApiUrl(apiPath, filters, thread) };
    }

    return {
        apiUrl: tile.link.startsWith("/api/")
            ? tile.link
            : buildThreadApiUrl("/api/v1/home", filters, thread),
    };
};

export function CockpitClient({ home, filters, activeRole, children }: CockpitClientProps) {
    const evidence = useEvidenceDrawer();

    const openPanel = (title: string, params: { apiUrl?: string; metric?: string }) => {
        evidence.open({ title, ...params, filters });
    };

    const rawDeltas = home?.deltas ?? [];
    const sortedDeltas = sortDeltasByRole(rawDeltas, activeRole);

    // Distinguish "no sources connected" from "sources present but no deltas computed".
    const hasSources = Object.keys(home?.freshness?.sources ?? {}).length > 0;
    const emptyVariant = hasSources ? "detector-enabled-no-findings" : "no-data-connected";

    return (
        <>
            {/* Key Shifts — role-aware delta row (CHAOS-2094) */}
            <section
                className="rounded-(--radius-md) border border-(--card-stroke) bg-(--card) p-5"
                data-testid="key-shifts-row"
            >
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-label-caps uppercase text-(--ink-muted)">Key Shifts</p>
                        <p className="mt-1 text-sm text-(--ink-muted)">
                            Metric movements ordered for your role.
                        </p>
                    </div>
                    <Link
                        href={buildExploreUrl({ filters, role: activeRole })}
                        className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
                    >
                        {CTA_LABELS.openEvidence}
                    </Link>
                </div>

                {sortedDeltas.length > 0 ? (
                    <div
                        className="mt-4 grid grid-cols-2 gap-3.5 md:grid-cols-4"
                        data-testid="key-shifts-grid"
                    >
                        {/* Role-priority ordering intentionally trumps magnitude; show top 8 per window. */}
                        {sortedDeltas.slice(0, 8).map((delta) => (
                            <Link
                                key={delta.metric}
                                href={buildExploreUrl({
                                    metric: delta.metric,
                                    filters,
                                    role: activeRole,
                                })}
                                className="group min-h-31 rounded-(--radius-md) border border-(--card-stroke) bg-background px-5 py-4.5 transition hover:-translate-y-0.5 hover:border-(--accent)"
                            >
                                <p className="text-label-caps uppercase text-(--ink-muted)">
                                    {delta.label}
                                </p>
                                <p className="mt-2.5 text-[1.75rem] font-semibold leading-tight tabular-nums text-foreground">
                                    {formatMetricValue(delta.value, delta.unit)}
                                </p>
                                <MetricDelta
                                    value={delta.delta_pct}
                                    inverseGood={
                                        getMetricPolarity(delta.metric) === "lowerIsBetter"
                                    }
                                    className="mt-1"
                                />
                            </Link>
                        ))}
                    </div>
                ) : (
                    <div className="mt-4">
                        <DataState variant={emptyVariant} />
                    </div>
                )}
            </section>

            <section
                aria-label="Investigation threads"
                data-testid="investigation-threads"
                className="overflow-hidden rounded-(--radius-md) border border-(--card-stroke) bg-(--card)"
            >
                <ThreadRow
                    id="notable-shifts"
                    title="Notable shifts"
                    summary="Short shifts from the selected window."
                >
                    <div className="space-y-3 text-sm text-(--ink-muted)">
                        {(home?.summary ?? []).map((sentence, idx) => (
                            <button
                                type="button"
                                key={sentence.id ?? sentence.text ?? idx}
                                onClick={() =>
                                    openPanel("Notable Shift", { apiUrl: sentence.evidence_link })
                                }
                                className="block w-full text-left rounded-(--radius-sm) border border-transparent bg-background px-4 py-3 transition hover:border-(--card-stroke)"
                            >
                                {scrubIdentifiers(sentence.text).text}
                            </button>
                        ))}
                        {!home?.summary?.length && (
                            <p className="rounded-(--radius-sm) border border-dashed border-(--card-stroke) bg-background px-4 py-3">
                                Summary will appear once data is ingested.
                            </p>
                        )}
                    </div>
                </ThreadRow>

                <ThreadRow
                    id="investigation-threads"
                    title="Investigation threads"
                    summary={home?.constraint.title ?? "Constraint pending"}
                >
                    <div className="flex items-center justify-end">
                        <Link
                            href={withFilterParam("/opportunities", filters, activeRole)}
                            className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
                        >
                            {CTA_LABELS.viewAll}
                        </Link>
                    </div>
                    <div className="mt-4 grid gap-3">
                        {home?.tiles
                            ? Object.entries(home.tiles).map(([key, tile]) => (
                                  <button
                                      type="button"
                                      key={key}
                                      onClick={() =>
                                          openPanel(
                                              tile.title,
                                              getThreadEvidenceTarget(key, tile, filters),
                                          )
                                      }
                                      className="group w-full text-left rounded-(--radius-sm) border border-(--card-stroke) bg-background px-4 py-3 transition hover:border-(--accent)"
                                  >
                                      <p className="text-label-caps uppercase text-(--ink-muted)">
                                          {tile.title}
                                      </p>
                                      <p className="mt-2 text-base font-semibold text-foreground">
                                          {tile.subtitle}
                                      </p>
                                      <p className="mt-3 text-xs text-(--ink-muted)">
                                          {CTA_LABELS.evidence}
                                      </p>
                                  </button>
                              ))
                            : null}
                        <Link
                            href={withFilterParam("/opportunities", filters, activeRole)}
                            className="block rounded-(--radius-sm) border border-(--card-stroke) bg-(--surface-raised) px-4 py-3"
                        >
                            <p className="text-label-caps uppercase text-(--ink-muted)">
                                Focus thread
                            </p>
                            <p className="mt-2 text-base font-semibold">
                                {home?.constraint.title ?? "Constraint pending"}
                            </p>
                            <p className="mt-2 text-sm text-(--ink-muted)">
                                {home?.constraint.claim ?? "Limiting factor pending."}
                            </p>
                        </Link>
                    </div>
                </ThreadRow>

                <ThreadRow
                    id="limiting-factor"
                    title="Limiting factor"
                    summary={
                        home?.limiting_factor?.claim ??
                        home?.constraint.claim ??
                        "Evidence will appear once data is ingested."
                    }
                >
                    <div className="flex items-center justify-end">
                        <button
                            type="button"
                            onClick={() =>
                                openPanel("Limiting Factor", {
                                    apiUrl: home?.limiting_factor?.evidence_ref ?? undefined,
                                })
                            }
                            className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
                        >
                            {CTA_LABELS.openEvidence}
                        </button>
                    </div>
                    <p className="mt-3 text-sm text-(--ink-muted)">
                        {home?.limiting_factor?.claim ??
                            home?.constraint.claim ??
                            "Evidence will appear once data is ingested."}
                    </p>
                    {home?.limiting_factor?.why_it_matters ? (
                        <p className="mt-2 text-sm text-(--ink-muted)">
                            {home.limiting_factor.why_it_matters}
                        </p>
                    ) : null}
                    {home?.limiting_factor?.recommended_action ? (
                        <div className="mt-3 rounded-(--radius-sm) border border-(--card-stroke) bg-(--surface-raised) p-3">
                            <p className="text-label-caps font-semibold uppercase tracking-[0.2em] text-(--accent-text)">
                                Recommended action
                            </p>
                            <p className="mt-1 text-sm leading-5 text-foreground">
                                {home.limiting_factor.recommended_action}
                            </p>
                        </div>
                    ) : null}
                    <div className="mt-4 space-y-3 text-sm">
                        {(home?.constraint.evidence ?? []).map((item) => (
                            <button
                                type="button"
                                key={`${item.label}-${item.link}`}
                                onClick={() => openPanel(item.label, { apiUrl: item.link })}
                                className="block w-full text-left rounded-(--radius-sm) border border-(--card-stroke) bg-background px-4 py-3 transition-colors hover:border-(--accent)"
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-(--ink-muted)">
                        {(home?.constraint.experiments ?? []).map((experiment) => (
                            <span
                                key={experiment}
                                className="rounded-full border border-(--card-stroke) bg-(--card-70) px-3 py-1"
                            >
                                {experiment}
                            </span>
                        ))}
                    </div>
                </ThreadRow>

                <ThreadRow
                    id="recent-events"
                    title="Recent events"
                    summary={
                        home?.events?.[0]?.text ?? "No major shifts detected in the current window."
                    }
                >
                    <div className="flex items-center justify-end">
                        <Link
                            href={buildExploreUrl({ filters, role: activeRole })}
                            className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
                        >
                            {CTA_LABELS.openEvidence}
                        </Link>
                    </div>
                    <div className="mt-4 space-y-4 text-sm">
                        {(home?.events ?? []).map((event) => (
                            <button
                                type="button"
                                key={`${event.type}-${event.ts}-${event.text}`}
                                onClick={() => openPanel(event.type, { apiUrl: event.link })}
                                className="block w-full text-left rounded-(--radius-sm) border border-(--card-stroke) bg-background px-4 py-3 transition-colors hover:border-(--accent)"
                            >
                                <div className="flex items-center justify-between text-label-caps uppercase text-(--ink-muted)">
                                    <span>{event.type}</span>
                                    <ClientTimestamp value={event.ts} />
                                </div>
                                <p className="mt-2 text-sm text-foreground">{event.text}</p>
                            </button>
                        ))}
                        {!home?.events?.length && (
                            <p className="rounded-(--radius-sm) border border-dashed border-(--card-stroke) bg-background px-4 py-3 text-(--ink-muted)">
                                No major shifts detected in the current window.
                            </p>
                        )}
                    </div>
                </ThreadRow>

                {children}
            </section>
        </>
    );
}
