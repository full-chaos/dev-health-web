"use client";

import { ChartTypeToggle } from "@/components/charts/ChartTypeToggle";
import { DataNote } from "@/components/charts/DataNote";
import { ArrowRight } from "lucide-react";
import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import { EvidenceFact, EvidenceFactList } from "@/components/evidence/EvidenceFacts";
import { Button } from "@/components/shared/Button";
import { Section } from "@/components/ui/Section";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CTA_LABELS } from "@/lib/design/cta";
import type { MetricFilter } from "@/lib/filters/types";
import { formatNumber } from "@/lib/formatters";
import {
    useInvestmentEvidenceQualityGroups,
    type InvestmentEvidenceQualityGroupDimension,
} from "@/lib/graphql/hooks/useInvestment";
import {
    formatBandLabel,
    formatQuality,
    formatSubcategoryLabel,
    formatWorkUnitLabel,
    formatWorkUnitTypeLabel,
    selectWorkUnitEntries,
    titleCase,
    type WorkUnitListEntry,
} from "@/lib/investment";
import type { WorkUnitInvestment } from "@/lib/types";
import type { WorkUnitTeamAttribution } from "@/lib/graphql/__generated__/types";
import { EvidenceEntryCard } from "./EvidenceEntryCard";
import { TeamAttributionBadge } from "./TeamAttributionBadge";

type GroupDimension = InvestmentEvidenceQualityGroupDimension;

type EvidenceGroup = {
    key: string;
    label: string;
    entries: WorkUnitListEntry[];
    totalEffort: number;
    /** Persisted group mean served by Analytics; never derived from displayed units. */
    qualityMean: number | null;
};

type InvestmentEvidenceTableProps = {
    workUnits: WorkUnitInvestment[];
    effortUnit: string;
    filters: MetricFilter;
    onSelectWorkUnit: (workUnitId: string) => void;
    /**
     * Render-only backend team attribution, keyed by work UNIT id (CHAOS-2608 /
     * CS7). The owning team is computed BACKEND-ONLY (the unit→team collapse
     * happens server-side); this table never recomputes a repo->team or
     * item->team mapping.
     */
    attributionByWorkUnit?: Map<string, WorkUnitTeamAttribution>;
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

/**
 * Match Analytics' persisted reporting group for an equal-weight vector.
 * This applies only to the served-mean lookup in this table; it neither
 * changes classifications nor recomputes the producer aggregate.
 */
function evidenceQualityGroupKey(vector: Record<string, number> | undefined | null): string | null {
    if (!vector) return null;
    let bestKey: string | null = null;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (const [key, value] of Object.entries(vector)) {
        if (value > bestValue || (value === bestValue && (bestKey === null || key < bestKey))) {
            bestKey = key;
            bestValue = value;
        }
    }
    return bestKey;
}

function groupKeyForUnit(dimension: GroupDimension, unit: WorkUnitInvestment): string {
    if (dimension === "theme") {
        return evidenceQualityGroupKey(unit.investment?.themes) ?? "__none__";
    }
    if (dimension === "subcategory") {
        return evidenceQualityGroupKey(unit.investment?.subcategories) ?? "__none__";
    }
    return unit.work_unit_type ?? "__none__";
}

type LiveSnapshot = {
    groups: EvidenceGroup[];
    groupBy: GroupDimension;
    effortUnit: string;
    attributionByWorkUnit?: Map<string, WorkUnitTeamAttribution>;
};
type LiveEvidence = { snapshot: LiveSnapshot; listeners: Set<() => void> };

/** The body of the group's drawer: the served numbers, then the units with their details. */
function GroupEvidenceBody({
    store,
    groupKey,
    onOpenUnitEvidence,
}: {
    store: LiveEvidence;
    groupKey: string;
    onOpenUnitEvidence: (workUnitId: string) => void;
}) {
    const snapshot = useSyncExternalStore(
        (listener) => {
            store.listeners.add(listener);
            return () => {
                store.listeners.delete(listener);
            };
        },
        () => store.snapshot,
        () => store.snapshot,
    );
    const group = snapshot.groups.find((entry) => entry.key === groupKey);
    if (!group) return null;
    return (
        <div className="space-y-4">
            <EvidenceFactList aria-label="Evidence group" testId="evidence-group-facts">
                <EvidenceFact
                    label="Average quality"
                    value={
                        group.qualityMean !== null
                            ? formatQuality(group.qualityMean)
                            : "Not reported"
                    }
                />
                <EvidenceFact label="Units" value={String(group.entries.length)} />
                <EvidenceFact
                    label="Weighted effort"
                    value={`${formatNumber(group.totalEffort)} ${snapshot.effortUnit}`}
                />
            </EvidenceFactList>
            <GroupUnitsList
                entries={group.entries}
                effortUnit={snapshot.effortUnit}
                attributionByWorkUnit={snapshot.attributionByWorkUnit}
                onOpenUnitEvidence={onOpenUnitEvidence}
            />
        </div>
    );
}

type GroupUnitsListProps = {
    entries: WorkUnitListEntry[];
    effortUnit: string;
    attributionByWorkUnit?: Map<string, WorkUnitTeamAttribution>;
    /** Select the work unit for the "How this was calculated" block below the table. */
    onOpenUnitEvidence: (workUnitId: string) => void;
};

/**
 * The work units of one group, each expandable to its classification rationale and linked
 * metadata. It is the body the row's Evidence action puts in the shared drawer (it was the
 * expandable row before); every served field it showed there is still shown.
 */
export function GroupUnitsList({
    entries,
    effortUnit,
    attributionByWorkUnit,
    onOpenUnitEvidence,
}: GroupUnitsListProps) {
    const [openUnits, setOpenUnits] = useState<Set<string>>(new Set());
    const toggleUnit = (id: string) => {
        setOpenUnits((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };
    return (
        <ul className="space-y-2">
            {entries.map((entry) => {
                const unit = entry.unit;
                const unitOpen = openUnits.has(unit.work_unit_id);
                const attribution = attributionByWorkUnit?.get(unit.work_unit_id);
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
                            onClick={() => toggleUnit(unit.work_unit_id)}
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
                                        confidence={attribution.confidence}
                                        teamName={attribution.teamName}
                                    />
                                ) : null}
                            </span>
                            <span className="flex items-center gap-3 text-xs text-(--ink-muted)">
                                <span>
                                    {formatNumber(entry.weightedEffort)} {effortUnit}
                                </span>
                                <span>
                                    {unit.evidence_quality.value !== null
                                        ? formatBandLabel(unit.evidence_quality.band ?? "unknown")
                                        : "Unknown"}
                                </span>
                            </span>
                        </button>

                        {unitOpen && (
                            <div className="space-y-4 border-t border-(--card-stroke) px-4 py-4">
                                <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                    <span>
                                        Evidence quality:{" "}
                                        {unit.evidence_quality.value !== null
                                            ? `${formatQuality(unit.evidence_quality.value)} (${formatBandLabel(unit.evidence_quality.band ?? "unknown")})`
                                            : "Unknown"}
                                    </span>
                                    {attribution ? (
                                        <span className="flex items-center gap-2">
                                            Team attribution:
                                            <TeamAttributionBadge
                                                source={attribution.source}
                                                confidence={attribution.confidence}
                                                teamName={attribution.teamName}
                                            />
                                            {attribution.teamName ? (
                                                <span className="tracking-normal text-(--ink)">
                                                    {attribution.teamName}
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
                                            No textual rationale reported for this work unit.
                                        </p>
                                    ) : (
                                        <div className="mt-2 space-y-2">
                                            {textual.map((item, idx) => (
                                                <EvidenceEntryCard
                                                    key={`textual-${idx}`}
                                                    entry={item as Record<string, unknown>}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                        Linked metadata
                                    </p>
                                    {metadata.length === 0 ? (
                                        <p className="mt-2 text-xs text-(--ink-muted)">
                                            No structural or contextual metadata reported.
                                        </p>
                                    ) : (
                                        <div className="mt-2 grid gap-2">
                                            {metadata.map((item, idx) => (
                                                <EvidenceEntryCard
                                                    key={`metadata-${idx}`}
                                                    entry={item as Record<string, unknown>}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => onOpenUnitEvidence(unit.work_unit_id)}
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
    );
}

/**
 * Evidence tab — table-first work-unit drilldown.
 *
 * Replaces the old "Unit Investment" card grid. Work units are grouped by a
 * real, persisted dimension (theme / subcategory / type) read from each unit's
 * investment vector; no categories are recomputed here. Each group row has an Evidence action that opens the shared drawer with its
 * work units, and each work unit expands there to its classification
 * rationale (textual evidence) and linked metadata (structural + contextual
 * evidence rendered as labelled rows). This is also where the retired
 * "Metadata only" toggle is subsumed: metadata is always surfaced in the
 * drawer rows instead of being gated behind a control that changed nothing.
 */
/** One column template for the head and every group row, so the four columns line up. */
const EVIDENCE_COLUMNS = "grid-cols-[minmax(0,1fr)_7.5rem_4rem_10rem_6rem]";

export function InvestmentEvidenceTable({
    workUnits,
    effortUnit,
    filters,
    onSelectWorkUnit,
    attributionByWorkUnit,
}: InvestmentEvidenceTableProps) {
    const [groupBy, setGroupBy] = useState<GroupDimension>("theme");
    const evidence = useEvidenceDrawer();
    const { groups: servedQualityGroups } = useInvestmentEvidenceQualityGroups({
        filters,
        groupBy,
    });

    const allEntries = useMemo<WorkUnitListEntry[]>(
        () =>
            selectWorkUnitEntries({
                focusSubcategory: null,
                workUnits,
                fallbackToAll: true,
            }),
        [workUnits],
    );

    const qualityByGroup = useMemo(
        () => new Map(servedQualityGroups.map((group) => [group.key, group.mean])),
        [servedQualityGroups],
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
                return {
                    key,
                    label: groupLabel(groupBy, key),
                    entries,
                    totalEffort,
                    qualityMean: qualityByGroup.get(key) ?? null,
                };
            })
            .sort((a, b) => b.totalEffort - a.totalEffort);
    }, [allEntries, groupBy, qualityByGroup]);

    // The drawer body is mounted once, at the click, so it cannot re-render with this table. It
    // reads the CURRENT groups and team attribution from this store instead, so a team badge that
    // arrives after the drawer opened (its own query) shows up without opening it again.
    const live = useRef<LiveEvidence>({
        snapshot: { groups, groupBy, effortUnit, attributionByWorkUnit },
        listeners: new Set(),
    });
    useEffect(() => {
        live.current.snapshot = { groups, groupBy, effortUnit, attributionByWorkUnit };
        live.current.listeners.forEach((listener) => listener());
    }, [groups, groupBy, effortUnit, attributionByWorkUnit]);

    // The row's Evidence action opens the ONE shared drawer: the group's served numbers, then its
    // work units with their details (what the expandable row held before).
    const openGroupEvidence = (group: EvidenceGroup) => {
        evidence.open({
            title: group.label,
            content: (
                <GroupEvidenceBody
                    store={live.current}
                    groupKey={group.key}
                    onOpenUnitEvidence={(workUnitId) => {
                        onSelectWorkUnit(workUnitId);
                        evidence.close();
                    }}
                />
            ),
        });
    };

    return (
        <Section
            data-testid="investment-evidence-table"
            title="Evidence drilldown"
            description="Work units grouped by their strongest persisted classification."
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <ChartTypeToggle
                    options={[...GROUP_OPTIONS]}
                    value={groupBy}
                    onChangeAction={setGroupBy}
                    ariaLabel="Group evidence by"
                />
                <span className="text-xs text-(--ink-muted)">Group the same work units</span>
            </div>

            <div className="mt-4 overflow-hidden rounded-(--radius-md) border border-(--card-stroke)">
                <div
                    data-testid="evidence-table-head"
                    className={`grid ${EVIDENCE_COLUMNS} items-center gap-3 border-b border-(--card-stroke) bg-(--card-70) px-4 py-2 text-label-caps uppercase text-(--ink-muted)`}
                >
                    <span>{GROUP_OPTIONS.find((o) => o.id === groupBy)?.label}</span>
                    <span className="text-right">Average quality</span>
                    <span className="text-right">Units</span>
                    <span className="text-right">Weighted effort</span>
                    {/* design-lint-disable-next-line cta-from-registry -- screen-reader-only table-column header; not an action */}
                    <span className="sr-only">Evidence</span>
                </div>

                {groups.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-(--ink-muted)">
                        No work units available for the selected window.
                    </p>
                ) : (
                    groups.map((group) => {
                        return (
                            <div
                                key={group.key}
                                className="border-b border-(--card-stroke) last:border-b-0"
                            >
                                <div
                                    data-testid="evidence-group-row"
                                    className={`grid ${EVIDENCE_COLUMNS} items-center gap-3 px-4 py-3 transition hover:bg-(--card-70)`}
                                >
                                    <span className="flex min-w-0 items-center gap-2">
                                        <span className="truncate text-sm font-medium text-foreground">
                                            {group.label}
                                        </span>
                                    </span>
                                    {/* The same value the group row printed inline before. */}
                                    <span
                                        data-testid="evidence-group-quality"
                                        className="text-right text-sm tabular-nums text-(--ink-muted)"
                                    >
                                        {group.qualityMean !== null
                                            ? formatQuality(group.qualityMean)
                                            : "Not reported"}
                                    </span>
                                    <span className="text-right text-sm tabular-nums text-(--ink-muted)">
                                        {group.entries.length}
                                    </span>
                                    <span className="text-right text-sm tabular-nums text-foreground">
                                        {formatNumber(group.totalEffort)} {effortUnit}
                                    </span>
                                    <span className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            icon={<ArrowRight />}
                                            aria-label={`${CTA_LABELS.evidence}: ${group.label}`}
                                            data-testid="evidence-group-action"
                                            onClick={() => openGroupEvidence(group)}
                                        >
                                            {CTA_LABELS.evidence}
                                        </Button>
                                    </span>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
            {/* The visible unit list can be capped. The mean stays a persisted aggregate served
                for the selected group and window, so it is never recomputed from that list. */}
            <DataNote>
                Open a group&apos;s Evidence to read each unit&apos;s rationale and linked metadata.
                Average quality is the persisted group mean served for the selected window. It is
                not calculated from the listed work units. Not reported means Analytics has no
                persisted quality mean for the group.
            </DataNote>
        </Section>
    );
}
