"use client";

import { useMemo, useState } from "react";
import { CTA_LABELS } from "@/lib/design/cta";
import { formatNumber } from "@/lib/formatters";
import {
    formatBandLabel,
    formatQuality,
    formatSubcategoryLabel,
    formatWorkUnitIdToken,
    formatWorkUnitLabel,
    formatWorkUnitTypeLabel,
    selectWorkUnitEntries,
    titleCase,
    topInvestmentKey,
    type WorkUnitListEntry,
} from "@/lib/investment";
import type { WorkUnitInvestment } from "@/lib/types";
import type { WorkItemTeamAttribution } from "@/lib/graphql/__generated__/types";
import { EvidenceEntryCard } from "./EvidenceEntryCard";
import { TeamAttributionBadge } from "./TeamAttributionBadge";

type GroupDimension = "theme" | "subcategory" | "type";

type EvidenceGroup = {
    key: string;
    label: string;
    entries: WorkUnitListEntry[];
    totalEffort: number;
    avgQuality: number | null;
};

type InvestmentEvidenceTableProps = {
    workUnits: WorkUnitInvestment[];
    effortUnit: string;
    onSelectWorkUnit: (workUnitId: string) => void;
    /**
     * Render-only backend team-attribution provenance, keyed by work item id
     * (CHAOS-2608 / CS7). Attribution is computed BACKEND-ONLY; this table never
     * recomputes a repo->team or item->team mapping.
     */
    attributionByWorkItem?: Map<string, WorkItemTeamAttribution>;
};

const GROUP_OPTIONS: ReadonlyArray<{ id: GroupDimension; label: string }> = [
    { id: "theme", label: "Theme" },
    { id: "subcategory", label: "Subcategory" },
    { id: "type", label: "Type" },
];

const UNGROUPED_LABEL = "Unattributed";

function groupLabel(dimension: GroupDimension, key: string): string {
    if (key === "__none__") return UNGROUPED_LABEL;
    if (dimension === "subcategory") return formatSubcategoryLabel(key, true);
    if (dimension === "type") return titleCase(key);
    return titleCase(key);
}

function groupKeyForUnit(dimension: GroupDimension, unit: WorkUnitInvestment): string {
    if (dimension === "theme") {
        return topInvestmentKey(unit.investment?.themes) ?? "__none__";
    }
    if (dimension === "subcategory") {
        return topInvestmentKey(unit.investment?.subcategories) ?? "__none__";
    }
    return unit.work_unit_type ?? "__none__";
}

/**
 * Evidence tab — table-first work-unit drilldown.
 *
 * Replaces the old "Unit Investment" card grid. Work units are grouped by a
 * real, persisted dimension (theme / subcategory / type) read from each unit's
 * investment vector; no categories are recomputed here. Each group expands to
 * its work units, and each work unit expands inline to its classification
 * rationale (textual evidence) and linked metadata (structural + contextual
 * evidence rendered as labelled rows). This is also where the retired
 * "Metadata only" toggle is subsumed: metadata is always surfaced in the
 * expandable rows instead of being gated behind a control that changed nothing.
 */
export function InvestmentEvidenceTable({
    workUnits,
    effortUnit,
    onSelectWorkUnit,
    attributionByWorkItem,
}: InvestmentEvidenceTableProps) {
    const [groupBy, setGroupBy] = useState<GroupDimension>("theme");
    const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
    const [openUnits, setOpenUnits] = useState<Set<string>>(new Set());

    const allEntries = useMemo<WorkUnitListEntry[]>(
        () =>
            selectWorkUnitEntries({
                focusSubcategory: null,
                workUnits,
                fallbackToAll: true,
            }),
        [workUnits],
    );

    const groups = useMemo<EvidenceGroup[]>(() => {
        const buckets = new Map<string, WorkUnitListEntry[]>();
        for (const entry of allEntries) {
            const key = groupKeyForUnit(groupBy, entry.unit);
            const bucket = buckets.get(key);
            if (bucket) {
                bucket.push(entry);
            } else {
                buckets.set(key, [entry]);
            }
        }
        return [...buckets.entries()]
            .map(([key, entries]) => {
                const totalEffort = entries.reduce((sum, entry) => sum + entry.weightedEffort, 0);
                const qualityValues = entries
                    .map((entry) => entry.unit.evidence_quality.value)
                    .filter((value): value is number => value !== null);
                const avgQuality = qualityValues.length
                    ? qualityValues.reduce((sum, value) => sum + value, 0) / qualityValues.length
                    : null;
                return {
                    key,
                    label: groupLabel(groupBy, key),
                    entries,
                    totalEffort,
                    avgQuality,
                };
            })
            .sort((a, b) => b.totalEffort - a.totalEffort);
    }, [allEntries, groupBy]);

    const toggleGroup = (key: string) => {
        setOpenGroups((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const toggleUnit = (id: string) => {
        setOpenUnits((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="font-(--font-display) text-lg">Evidence drilldown</h3>
                    <p className="mt-1 text-sm text-(--ink-muted)">
                        Work units that back the investment mix, grouped by their strongest
                        persisted classification. Expand a row to read the rationale and the linked
                        metadata behind it.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                        Group by
                    </span>
                    <div
                        role="radiogroup"
                        aria-label="Group evidence by"
                        className="flex gap-1 rounded-full border border-(--card-stroke) bg-(--card-70) p-1"
                    >
                        {GROUP_OPTIONS.map((option) => (
                            <button
                                key={option.id}
                                type="button"
                                role="radio"
                                aria-checked={groupBy === option.id}
                                onClick={() => setGroupBy(option.id)}
                                className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.2em] ${
                                    groupBy === option.id
                                        ? "bg-(--accent-2) text-white"
                                        : "text-(--ink-muted)"
                                }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-(--card-stroke)">
                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-(--card-stroke) bg-(--card-70) px-4 py-2 text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                    <span>{GROUP_OPTIONS.find((o) => o.id === groupBy)?.label}</span>
                    <span className="text-right">Units</span>
                    <span className="text-right">Weighted effort</span>
                </div>

                {groups.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-(--ink-muted)">
                        No work units available for the selected window.
                    </p>
                ) : (
                    groups.map((group) => {
                        const isOpen = openGroups.has(group.key);
                        return (
                            <div
                                key={group.key}
                                className="border-b border-(--card-stroke) last:border-b-0"
                            >
                                <button
                                    type="button"
                                    aria-expanded={isOpen}
                                    onClick={() => toggleGroup(group.key)}
                                    className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3 text-left transition hover:bg-(--card-70)"
                                >
                                    <span className="flex min-w-0 items-center gap-2">
                                        <span
                                            aria-hidden
                                            className={`text-(--accent-2) transition-transform ${isOpen ? "rotate-90" : ""}`}
                                        >
                                            ›
                                        </span>
                                        <span className="truncate text-sm font-medium text-foreground">
                                            {group.label}
                                        </span>
                                        <span className="shrink-0 text-xs text-(--ink-muted)">
                                            avg quality:{" "}
                                            {group.avgQuality !== null
                                                ? formatQuality(group.avgQuality)
                                                : "Unknown"}
                                        </span>
                                    </span>
                                    <span className="text-right text-sm tabular-nums text-(--ink-muted)">
                                        {group.entries.length}
                                    </span>
                                    <span className="text-right text-sm tabular-nums text-foreground">
                                        {formatNumber(group.totalEffort)} {effortUnit}
                                    </span>
                                </button>

                                {isOpen && (
                                    <ul className="space-y-2 bg-(--card-80) px-4 pb-4">
                                        {group.entries.map((entry) => {
                                            const unit = entry.unit;
                                            const unitOpen = openUnits.has(unit.work_unit_id);
                                            const attribution = attributionByWorkItem?.get(
                                                unit.work_unit_id,
                                            );
                                            const textual = unit.evidence?.textual ?? [];
                                            const metadata = [
                                                ...(unit.evidence?.structural ?? []),
                                                ...(unit.evidence?.contextual ?? []),
                                            ];
                                            return (
                                                <li
                                                    key={unit.work_unit_id}
                                                    className="rounded-2xl border border-(--card-stroke) bg-(--card-70)"
                                                >
                                                    <button
                                                        type="button"
                                                        aria-expanded={unitOpen}
                                                        onClick={() =>
                                                            toggleUnit(unit.work_unit_id)
                                                        }
                                                        className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left"
                                                    >
                                                        <span className="flex min-w-0 items-center gap-2">
                                                            <span
                                                                aria-hidden
                                                                className={`text-(--accent-2) transition-transform ${unitOpen ? "rotate-90" : ""}`}
                                                            >
                                                                ›
                                                            </span>
                                                            <span className="truncate text-sm font-medium text-foreground">
                                                                {formatWorkUnitLabel(unit)}
                                                            </span>
                                                            {formatWorkUnitTypeLabel(unit) ? (
                                                                <span className="shrink-0 rounded-full border border-(--card-stroke) px-2 py-0.5 text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                                                    {formatWorkUnitTypeLabel(unit)}
                                                                </span>
                                                            ) : null}
                                                            {attribution ? (
                                                                <TeamAttributionBadge
                                                                    source={attribution.source}
                                                                    confidence={
                                                                        attribution.confidence
                                                                    }
                                                                    teamName={attribution.teamName}
                                                                />
                                                            ) : null}
                                                        </span>
                                                        <span className="flex items-center gap-3 text-xs text-(--ink-muted)">
                                                            <span>
                                                                {formatNumber(entry.weightedEffort)}{" "}
                                                                {effortUnit}
                                                            </span>
                                                            <span>
                                                                {unit.evidence_quality.value !==
                                                                null
                                                                    ? formatBandLabel(
                                                                          unit.evidence_quality
                                                                              .band ?? "unknown",
                                                                      )
                                                                    : "Unknown"}
                                                            </span>
                                                        </span>
                                                    </button>

                                                    {unitOpen && (
                                                        <div className="space-y-4 border-t border-(--card-stroke) px-4 py-4">
                                                            <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                                                <span>
                                                                    ID:{" "}
                                                                    <span className="font-mono tracking-normal text-(--ink)">
                                                                        {formatWorkUnitIdToken(
                                                                            unit.work_unit_id,
                                                                        )}
                                                                    </span>
                                                                </span>
                                                                <span>
                                                                    Evidence quality:{" "}
                                                                    {unit.evidence_quality.value !==
                                                                    null
                                                                        ? `${formatQuality(unit.evidence_quality.value)} (${formatBandLabel(unit.evidence_quality.band ?? "unknown")})`
                                                                        : "Unknown"}
                                                                </span>
                                                                {attribution ? (
                                                                    <span className="flex items-center gap-2">
                                                                        Team attribution:
                                                                        <TeamAttributionBadge
                                                                            source={
                                                                                attribution.source
                                                                            }
                                                                            confidence={
                                                                                attribution.confidence
                                                                            }
                                                                            teamName={
                                                                                attribution.teamName
                                                                            }
                                                                        />
                                                                        {attribution.teamName ? (
                                                                            <span className="tracking-normal text-(--ink)">
                                                                                {
                                                                                    attribution.teamName
                                                                                }
                                                                            </span>
                                                                        ) : null}
                                                                    </span>
                                                                ) : null}
                                                            </div>

                                                            <div>
                                                                <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                                                    Classification rationale
                                                                </p>
                                                                {textual.length === 0 ? (
                                                                    <p className="mt-2 text-xs text-(--ink-muted)">
                                                                        No textual rationale
                                                                        reported for this work unit.
                                                                    </p>
                                                                ) : (
                                                                    <div className="mt-2 space-y-2">
                                                                        {textual.map(
                                                                            (item, idx) => (
                                                                                <EvidenceEntryCard
                                                                                    key={`textual-${idx}`}
                                                                                    entry={
                                                                                        item as Record<
                                                                                            string,
                                                                                            unknown
                                                                                        >
                                                                                    }
                                                                                />
                                                                            ),
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div>
                                                                <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                                                    Linked metadata
                                                                </p>
                                                                {metadata.length === 0 ? (
                                                                    <p className="mt-2 text-xs text-(--ink-muted)">
                                                                        No structural or contextual
                                                                        metadata reported.
                                                                    </p>
                                                                ) : (
                                                                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                                                                        {metadata.map(
                                                                            (item, idx) => (
                                                                                <EvidenceEntryCard
                                                                                    key={`metadata-${idx}`}
                                                                                    entry={
                                                                                        item as Record<
                                                                                            string,
                                                                                            unknown
                                                                                        >
                                                                                    }
                                                                                />
                                                                            ),
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    onSelectWorkUnit(
                                                                        unit.work_unit_id,
                                                                    )
                                                                }
                                                                className="rounded-full border border-(--card-stroke) px-3 py-1 text-xs uppercase tracking-[0.2em] text-(--accent-2) hover:border-(--accent-2)/40"
                                                            >
                                                                {CTA_LABELS.openEvidence}
                                                            </button>
                                                        </div>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
