"use client";

import { useState } from "react";
import Link from "next/link";
import { EvidencePanel } from "@/components/evidence";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { formatDelta, formatMetricValue } from "@/lib/formatters";
import { ClientTimestamp } from "@/components/ClientTimestamp";
import type { HomeResponse, MetricDelta } from "@/lib/types";
import type { MetricFilter } from "@/lib/filters/types";

type CockpitClientProps = {
    home: HomeResponse | null;
    filters: MetricFilter;
    activeRole: string;
    prioritizedDeltas: MetricDelta[];
    placeholderDeltas: boolean;
};

const deltaAccent = (value: number) =>
    value > 0
        ? "text-(--accent-3)"
        : value < 0
            ? "text-(--accent-negative)"
            : "text-(--ink-muted)";

export function CockpitClient({
    home,
    filters,
    activeRole,
    prioritizedDeltas,
    placeholderDeltas,
}: CockpitClientProps) {
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

    return (
        <>
            <EvidencePanel
                isOpen={panelState.isOpen}
                onClose={closePanel}
                title={panelState.title}
                apiUrl={panelState.apiUrl}
                metric={panelState.metric}
                filters={filters}
            />

            <section>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                            Key shifts
                        </p>
                        <p className="mt-1 text-sm text-(--ink-muted)">
                            Small shifts in the selected window.
                        </p>
                    </div>
                    <Link
                        href={withFilterParam("/metrics?tab=flow", filters, activeRole)}
                        className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
                    >
                        View metrics
                    </Link>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                    {prioritizedDeltas.map((delta) => (
                        <button
                            type="button"
                            key={delta.metric}
                            onClick={() => openPanel(delta.label, { metric: delta.metric })}
                            data-testid="delta-tile"
                            className="group rounded-3xl border border-(--card-stroke) bg-(--card) p-4 transition hover:-translate-y-1 hover:shadow-lg text-left w-full"
                        >
                            <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                <span>{delta.label}</span>
                                <span className={deltaAccent(delta.delta_pct)}>
                                    {formatDelta(delta.delta_pct)}
                                </span>
                            </div>
                            <p className="mt-4 text-2xl font-semibold metric-hero">
                                {placeholderDeltas ? "--" : formatMetricValue(delta.value, delta.unit)}
                            </p>
                            <p className="mt-3 text-xs text-(--ink-muted)">
                                Open evidence
                            </p>
                        </button>
                    ))}
                </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5">
                    <h2 className="font-(--font-display) text-2xl">Notable shifts</h2>
                    <p className="mt-2 text-sm text-(--ink-muted)">
                        Short shifts from the selected window.
                    </p>
                    <div className="mt-4 space-y-3 text-sm text-(--ink-muted)">
                        {(home?.summary ?? []).map((sentence, idx) => (
                            <button type="button"
                                key={sentence.id ?? sentence.text ?? idx}
                                onClick={() => openPanel("Notable Shift", { apiUrl: sentence.evidence_link })}
                                className="block w-full text-left rounded-2xl border border-transparent bg-(--card-60) px-4 py-3 transition hover:border-(--card-stroke)"
                            >
                                {sentence.text}
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
                            href={withFilterParam("/opportunities", filters)}
                            className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
                        >
                            View all
                        </Link>
                    </div>
                    <div className="mt-4 grid gap-3">
                        {home?.tiles
                        ? Object.entries(home.tiles).map(([key, tile]) => (
                                <button type="button"
                                    key={key}
                                    onClick={() => openPanel(tile.title, { apiUrl: tile.link })}
                                    className="group w-full text-left rounded-2xl border border-(--card-stroke) bg-(--card) px-4 py-3 transition hover:-translate-y-1"
                                >
                                    <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                                        {tile.title}
                                    </p>
                                    <p className="mt-2 text-base font-semibold text-foreground">
                                        {tile.subtitle}
                                    </p>
                                    <p className="mt-3 text-xs text-(--ink-muted)">
                                        Evidence
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
                            onClick={() => openPanel("Limiting Factor", { metric: "review_latency" })}
                            className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
                        >
                            Open evidence
                        </button>
                    </div>
                    <p className="mt-3 text-sm text-(--ink-muted)">
                        {home?.constraint.claim ?? "Evidence will appear once data is ingested."}
                    </p>
                    <div className="mt-4 space-y-3 text-sm">
                        {(home?.constraint.evidence ?? []).map((item, idx) => (
                            <button type="button"
                                key={`${item.label}-${idx}`}
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
                            Open in Explore
                        </Link>
                    </div>
                    <div className="mt-4 space-y-4 text-sm">
                        {(home?.events ?? []).map((event, idx) => (
                            <button type="button"
                                key={`${event.type}-${idx}`}
                                onClick={() => openPanel(event.type, { apiUrl: event.link })}
                                className="block w-full text-left rounded-2xl border border-(--card-stroke) bg-(--card) px-4 py-3 hover:border-(--card-stroke)/80 transition-colors"
                            >
                                <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                    <span>{event.type}</span>
                                    <ClientTimestamp value={event.ts} />
                                </div>
                                <p className="mt-2 text-sm text-foreground">
                                    {event.text}
                                </p>
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
