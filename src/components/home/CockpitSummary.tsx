"use client";

import { useState } from "react";

import { EvidencePanel } from "@/components/evidence";
import { EntityLabel } from "@/components/labels/EntityLabel";
import { CTA_LABELS } from "@/lib/design/cta";
import type { MetricFilter } from "@/lib/filters/types";
import type { CockpitHealthStatus, HomeResponse } from "@/lib/types";

import { CockpitEmptyState } from "./CockpitEmptyState";

/**
 * Dominant cockpit summary block (CHAOS-2049 / CHAOS-2030 Phase 3).
 *
 * This is the single dominant conclusion of the cockpit. It answers, in order,
 * the first beats of the operating-review narrative: the engineering health
 * state, the top change driving it, why that matters, and the recommended next
 * action — each tied to a populated EvidencePanel. The ranked signal detail,
 * recent context, and data confidence render below this in the page sequence.
 */

type StatusMeta = {
    label: string;
    chip: string;
    edge: string;
};

const STATUS_META: Record<CockpitHealthStatus, StatusMeta> = {
    healthy: {
        label: "Healthy",
        chip: "border-(--positive)/40 bg-(--positive)/12 text-(--positive)",
        edge: "border-l-(--positive)",
    },
    watch: {
        label: "Watch",
        chip: "border-(--info)/50 bg-(--info)/12 text-(--info)",
        edge: "border-l-(--info)",
    },
    at_risk: {
        label: "At risk",
        chip: "border-(--caution)/50 bg-(--caution)/12 text-(--caution)",
        edge: "border-l-(--caution)",
    },
    critical: {
        label: "Critical",
        chip: "border-(--negative)/50 bg-(--negative)/12 text-(--negative)",
        edge: "border-l-(--negative)",
    },
};

const DIRECTION_GLYPH = { up: "↑", down: "↓", flat: "→" } as const;

type CockpitSummaryProps = {
    home: HomeResponse | null;
    filters: MetricFilter;
};

type PanelState = {
    isOpen: boolean;
    title: string;
    apiUrl?: string;
    metric?: string;
};

export function CockpitSummary({ home, filters }: CockpitSummaryProps) {
    const [panel, setPanel] = useState<PanelState>({ isOpen: false, title: "" });

    const openPanel = (title: string, params: { apiUrl?: string; metric?: string }) =>
        setPanel({ isOpen: true, title, ...params });
    const closePanel = () => setPanel((prev) => ({ ...prev, isOpen: false }));

    const health = home?.health_state;
    const status: CockpitHealthStatus = health?.status ?? "watch";
    const meta = STATUS_META[status] ?? STATUS_META.watch;
    const topSignal = home?.signals?.[0];

    return (
        <section
            data-testid="cockpit-summary"
            data-status={status}
            // Concept `.hero-signal`: surface card, a 3px edge in the status color (the chip still says the
            // state in words), no gradient and no heavy shadow.
            className={`relative overflow-hidden rounded-(--radius-md) border border-l-3 border-(--card-stroke) bg-(--card) p-6 sm:p-8 ${meta.edge}`}
        >
            <EvidencePanel
                isOpen={panel.isOpen}
                onCloseAction={closePanel}
                title={panel.title}
                apiUrl={panel.apiUrl}
                metric={panel.metric}
                filters={filters}
            />

            {/* Health state — the dominant conclusion */}
            <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                    Engineering health
                </span>
                <span
                    data-testid="cockpit-health-status"
                    className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${meta.chip}`}
                >
                    {meta.label}
                </span>
            </div>

            {/* The page title is the one h1 (PageHeader); this is a section heading. */}
            <h2
                data-testid="cockpit-headline"
                className="mt-4 max-w-3xl font-(--font-display) text-h1 font-semibold"
            >
                <EntityLabel
                    variant="text"
                    id={health?.headline ?? "Engineering health is steady this week"}
                />
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-(--ink-muted)">
                <EntityLabel
                    variant="text"
                    id={
                        health?.summary ??
                        "Available signals suggest no acute limiting factor in the selected window."
                    }
                />
            </p>

            {/* Top change — the highest-impact signal driving the state */}
            {topSignal ? (
                <div
                    data-testid="cockpit-top-change"
                    className="mt-6 rounded-(--radius-md) border border-(--card-stroke) bg-background p-5"
                >
                    <p className="text-label-caps font-semibold uppercase tracking-[0.28em] text-(--accent-text)">
                        Top change
                    </p>
                    <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                        <h2 className="font-(--font-display) text-xl leading-tight text-foreground">
                            <EntityLabel variant="text" id={topSignal.title} />
                        </h2>
                        <div className="flex items-center gap-2 text-xs">
                            <span className="rounded-full border border-(--card-stroke) bg-(--card-70) px-2.5 py-0.5 font-bold uppercase tracking-[0.16em] text-(--ink-muted)">
                                {topSignal.severity}
                            </span>
                            {(topSignal.scope_entity?.id ?? topSignal.affected_scope) ? (
                                <EntityLabel
                                    id={topSignal.scope_entity?.id ?? topSignal.affected_scope}
                                    displayName={topSignal.scope_entity?.display_name ?? null}
                                    data-testid="cockpit-top-change-scope"
                                    className="rounded-full border border-(--card-stroke) bg-(--card-70) px-2.5 py-0.5 font-medium text-(--ink-muted)"
                                />
                            ) : null}
                            {topSignal.delta ? (
                                <span className="text-(--ink-muted)">
                                    <span aria-hidden>{DIRECTION_GLYPH[topSignal.direction]}</span>{" "}
                                    {topSignal.delta}
                                </span>
                            ) : null}
                        </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-(--ink-muted)">
                        <EntityLabel variant="text" id={topSignal.why_it_matters} />
                    </p>

                    <div className="mt-4 rounded-(--radius-sm) border border-(--card-stroke) bg-(--surface-raised) p-3">
                        <p className="text-label-caps font-semibold uppercase tracking-[0.2em] text-(--accent-text)">
                            Recommended action
                        </p>
                        <p className="mt-1 text-sm leading-5 text-foreground">
                            <EntityLabel variant="text" id={topSignal.recommended_action} />
                        </p>
                    </div>

                    <button
                        type="button"
                        data-testid="cockpit-top-change-evidence"
                        onClick={() =>
                            openPanel(topSignal.title, {
                                apiUrl: topSignal.evidence_ref || undefined,
                                metric: topSignal.metric,
                            })
                        }
                        className="mt-4 flex w-full items-center justify-between rounded-(--radius-sm) border border-(--card-stroke) bg-(--card-70) px-4 py-2.5 text-left text-xs font-medium uppercase tracking-[0.18em] text-(--ink-muted) transition-colors hover:border-(--accent-2)/40 hover:bg-(--accent-2)/10 hover:text-(--accent-2)"
                    >
                        {CTA_LABELS.openEvidence}
                        <span aria-hidden>↗</span>
                    </button>
                </div>
            ) : (
                <div className="mt-6">
                    <CockpitEmptyState
                        variant="no-findings"
                        data-testid="cockpit-top-change-empty"
                    />
                </div>
            )}
        </section>
    );
}
