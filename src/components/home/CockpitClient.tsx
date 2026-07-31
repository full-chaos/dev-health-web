"use client";

import { useState } from "react";
import Link from "next/link";
import { EvidencePanel } from "@/components/evidence";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { CTA_LABELS } from "@/lib/design/cta";
import { ClientTimestamp } from "@/components/ClientTimestamp";
import { MetricDelta } from "@/components/shared/MetricDelta";
import { DataState } from "@/components/ui/DataState";
import { sortDeltasByRole, getMetricPolarity } from "@/lib/metrics/catalog";
import { formatMetricValue } from "@/lib/formatters";
import { scrubIdentifiers } from "@/lib/labels/entityLabel";
import type { HomeResponse } from "@/lib/types";
import type { MetricFilter } from "@/lib/filters/types";

type CockpitClientProps = {
    home: HomeResponse | null;
    filters: MetricFilter;
    activeRole: string;
};

const THREAD_API_TARGETS: Record<string, string> = {
    understand: "/api/v1/home",
    measure: "/api/v1/home",
    align: "/api/v1/investment",
    execute: "/api/v1/opportunities",
};

const buildThreadApiUrl = (path: string, filters: MetricFilter, thread: string) => {
    const params = new URLSearchParams({
        scope_type: filters.scope.level,
        range_days: String(filters.time.range_days),
        compare_days: String(filters.time.compare_days),
        thread,
    });

    const [scopeId] = filters.scope.ids;
    if (scopeId) params.set("scope_id", scopeId);
    if (filters.time.start_date) params.set("start_date", filters.time.start_date);
    if (filters.time.end_date) params.set("end_date", filters.time.end_date);

    return `${path}?${params.toString()}`;
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

export function CockpitClient({ home, filters, activeRole }: CockpitClientProps) {
    const [panelState, setPanelState] = useState<{
        isOpen: boolean;
        title: string;
        apiUrl?: string;
        metric?: string;
    }>({
        isOpen: false,
        title: "",
    });

    const openPanel = (title: string, params: { apiUrl?: string; metric?: string }) => {
        setPanelState({
            isOpen: true,
            title,
            ...params,
        });
    };

    const closePanel = () => {
        setPanelState((prev) => ({ ...prev, isOpen: false }));
    };

    const rawDeltas = home?.deltas ?? [];
    const sortedDeltas = sortDeltasByRole(rawDeltas, activeRole);

    // Distinguish "no sources connected" from "sources present but no deltas computed".
    const hasSources = Object.keys(home?.freshness?.sources ?? {}).length > 0;
    const emptyVariant = hasSources ? "detector-enabled-no-findings" : "no-data-connected";

    return (
        <>
            <EvidencePanel
                isOpen={panelState.isOpen}
                onCloseAction={closePanel}
                title={panelState.title}
                apiUrl={panelState.apiUrl}
                metric={panelState.metric}
                filters={filters}
            />

            {/* Key Shifts — role-aware delta row (CHAOS-2094) */}
            <section
                className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5"
                data-testid="key-shifts-row"
            >
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                            Key Shifts
                        </p>
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
                        className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4"
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
                                className="group rounded-2xl border border-(--card-stroke) bg-(--card) px-4 py-3 transition hover:-translate-y-1"
                            >
                                <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                                    {delta.label}
                                </p>
                                <p className="mt-2 text-base font-semibold text-foreground">
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

            <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5">
                    <h2 className="font-(--font-display) text-2xl">Notable shifts</h2>
                    <p className="mt-2 text-sm text-(--ink-muted)">
                        Short shifts from the selected window.
                    </p>
                    <div className="mt-4 space-y-3 text-sm text-(--ink-muted)">
                        {(home?.summary ?? []).map((sentence, idx) => (
                            <button
                                type="button"
                                key={sentence.id ?? sentence.text ?? idx}
                                onClick={() =>
                                    openPanel("Notable Shift", { apiUrl: sentence.evidence_link })
                                }
                                className="block w-full text-left rounded-2xl border border-transparent bg-(--card-60) px-4 py-3 transition hover:border-(--card-stroke)"
                            >
                                {scrubIdentifiers(sentence.text).text}
                            </button>
                        ))}
                        {!home?.summary?.length && (
                            <p className="rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-60) px-4 py-3">
                                Summary will appear once data is ingested.
                            </p>
                        )}
                    </div>
                </div>

                <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5">
                    <div className="flex items-center justify-between">
                        <h3 className="font-(--font-display) text-xl">Investigation threads</h3>
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
                                      className="group w-full text-left rounded-2xl border border-(--card-stroke) bg-(--card) px-4 py-3 transition hover:-translate-y-1"
                                  >
                                      <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
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
                            className="block rounded-2xl border border-(--card-stroke) bg-(--accent)/15 px-4 py-3"
                        >
                            <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
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
                </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5">
                    <div className="flex items-center justify-between">
                        <h3 className="font-(--font-display) text-xl">Limiting factor</h3>
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
                        <div className="mt-3 rounded-2xl border border-(--accent)/20 bg-(--accent)/8 p-3">
                            <p className="text-label-caps font-semibold uppercase tracking-[0.2em] text-(--accent)">
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
                                className="block w-full text-left rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-3 hover:bg-(--card-60) transition-colors"
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
                </div>

                <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5">
                    <div className="flex items-center justify-between">
                        <h3 className="font-(--font-display) text-xl">Recent events</h3>
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
                                className="block w-full text-left rounded-2xl border border-(--card-stroke) bg-(--card) px-4 py-3 hover:border-(--card-stroke)/80 transition-colors"
                            >
                                <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                    <span>{event.type}</span>
                                    <ClientTimestamp value={event.ts} />
                                </div>
                                <p className="mt-2 text-sm text-foreground">{event.text}</p>
                            </button>
                        ))}
                        {!home?.events?.length && (
                            <p className="rounded-2xl border border-dashed border-(--card-stroke) bg-(--card) px-4 py-3 text-(--ink-muted)">
                                No major shifts detected in the current window.
                            </p>
                        )}
                    </div>
                </div>
            </section>
        </>
    );
}
