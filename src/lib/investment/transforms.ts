/**
 * Investment view transform utilities.
 *
 * Extracted from InvestmentView.tsx to reduce component size
 * and enable reuse across investment-related views.
 */

import type { WorkUnitInvestment } from "@/lib/types";
import { formatNumber, formatTimestamp } from "@/lib/formatters";
import type { MetricFilter } from "@/lib/filters/types";
import { buildDateRange } from "@/lib/filters/window";
import { titleCase as sharedTitleCase } from "@/lib/stringUtils";
import { UNRESOLVED } from "@/lib/labels/unresolved";

// ============================================================================
// Work unit list selection
// ============================================================================

/**
 * A work unit paired with the allocation weight used to rank it in list views.
 * Mirrors the `EvidenceUnit` shape consumed by the Evidence-tab drilldown.
 */
export type WorkUnitListEntry = {
    unit: WorkUnitInvestment;
    /** The unit's allocation share to the focused subcategory; 1 when none is focused. */
    weight: number;
};

/**
 * Select the work units to show in a work-unit list, given an optional focused
 * subcategory.
 *
 * - When `focusSubcategory` is set: only the units that contribute to that
 *   subcategory, weighted by their subcategory share and sorted by that
 *   share (descending). This is the "drill into a subcategory" behavior.
 * - When `focusSubcategory` is null:
 *   - `fallbackToAll: true` → ALL units (weight 1), in the order given. Used by the Evidence tab so it is
 *     self-contained on direct entry / refresh / share (no selector required).
 *   - `fallbackToAll: false` (default) → an empty list. Used by the Overview
 *     drill-down, which prompts the user to pick a subcategory first.
 *
 * Pure + deterministic so it can be unit-tested without rendering the view.
 */
export const selectWorkUnitEntries = ({
    focusSubcategory,
    workUnits,
    fallbackToAll = false,
}: {
    focusSubcategory: string | null;
    workUnits: WorkUnitInvestment[];
    fallbackToAll?: boolean;
}): WorkUnitListEntry[] => {
    if (!focusSubcategory) {
        if (!fallbackToAll) {
            return [];
        }
        return workUnits.map((unit) => ({ unit, weight: 1 }));
    }

    return workUnits
        .map((unit) => {
            const weight = unit.investment?.subcategories?.[focusSubcategory] ?? 0;
            if (weight <= 0) {
                return null;
            }
            return { unit, weight };
        })
        .filter((entry): entry is WorkUnitListEntry => Boolean(entry))
        .sort((a, b) => b.weight - a.weight);
};

// ============================================================================
// Investment vector + evidence-band aggregation (Evidence / Confidence tabs)
// ============================================================================

/**
 * Return the highest-weighted key in an investment vector (theme or
 * subcategory map), or null when the vector is empty. Deterministic: ties
 * resolve to the first key encountered. Pure so the Evidence grouping and
 * Confidence aggregates can be unit-tested without rendering.
 */
export const topInvestmentKey = (
    vector: Record<string, number> | undefined | null,
): string | null => {
    if (!vector) return null;
    let bestKey: string | null = null;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (const [key, value] of Object.entries(vector)) {
        if (value > bestValue) {
            bestValue = value;
            bestKey = key;
        }
    }
    return bestKey;
};

// ============================================================================
// Rows per repository (one work unit can come back as several rows)
// ============================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The repository a work-unit row is scoped to: the `repo_ids[0]` of its `repo_scope` contextual
 * entry (a slug, a UUID, or "unassigned"), or null when the row carries none.
 */
export const workUnitRepoScope = (unit: Pick<WorkUnitInvestment, "evidence">): string | null => {
    for (const entry of unit.evidence?.contextual ?? []) {
        if (entry?.type !== "repo_scope") continue;
        const ids = entry.repo_ids;
        if (Array.isArray(ids) && typeof ids[0] === "string" && ids[0]) return ids[0];
    }
    return null;
};

/**
 * Name for one `repo_scope` value. An id is never a label: a UUID or "unassigned" is "Unresolved".
 */
export const repoScopeLabel = (value: string): string =>
    UUID_RE.test(value) || value === "unassigned" ? UNRESOLVED : value;

/** The repository name of a row, or null when the row has no repository scope. */
export const workUnitRepositoryLabel = (
    unit: Pick<WorkUnitInvestment, "evidence">,
): string | null => {
    const scope = workUnitRepoScope(unit);
    return scope === null ? null : repoScopeLabel(scope);
};

/**
 * Key of one row: the unit id plus its repository. Under a repository scope one unit is several
 * rows with the same `work_unit_id`; elsewhere the key is the unit id.
 */
export const workUnitRowKey = (unit: Pick<WorkUnitInvestment, "work_unit_id" | "evidence">) =>
    `${unit.work_unit_id}\u0000${workUnitRepoScope(unit) ?? ""}`;

/** Number of distinct work units among rows (a unit in 2 repositories is 1). */
export const countDistinctWorkUnits = (rows: ReadonlyArray<{ work_unit_id: string }>): number =>
    new Set(rows.map((row) => row.work_unit_id)).size;

/** The first row of each work unit, in order. */
export const firstRowPerWorkUnit = <T extends { work_unit_id: string }>(
    rows: readonly T[],
): T[] => {
    const seen = new Set<string>();
    return rows.filter((row) => {
        if (seen.has(row.work_unit_id)) return false;
        seen.add(row.work_unit_id);
        return true;
    });
};

/** Canonical evidence-quality bands, strongest → weakest, plus unknown. */
export const EVIDENCE_BAND_ORDER = ["high", "moderate", "low", "very_low", "unknown"] as const;

export type EvidenceBandId = (typeof EVIDENCE_BAND_ORDER)[number];

/**
 * Tally work units into evidence-quality bands. Units with a null/absent band
 * fall into `unknown`, so the counts always sum to the number of distinct work units and the
 * Confidence encoding never silently drops a unit. Pure + deterministic.
 */
export const computeEvidenceBandCounts = (
    workUnits: WorkUnitInvestment[],
): Record<EvidenceBandId, number> => {
    const counts: Record<EvidenceBandId, number> = {
        high: 0,
        moderate: 0,
        low: 0,
        very_low: 0,
        unknown: 0,
    };
    for (const unit of firstRowPerWorkUnit(workUnits)) {
        const band = unit.evidence_quality?.band;
        if (band && band in counts) {
            counts[band as EvidenceBandId] += 1;
        } else {
            counts.unknown += 1;
        }
    }
    return counts;
};

// ============================================================================
// Theme / Subcategory label utilities
// ============================================================================

export const THEME_LABELS: Record<string, string> = {
    feature_delivery: "Feature Delivery",
    operational: "Operational / Support",
    maintenance: "Maintenance / Tech Debt",
    quality: "Quality / Reliability",
    risk: "Risk / Security",
};

export const THEME_KEYS_BY_LABEL = Object.fromEntries(
    Object.entries(THEME_LABELS).map(([key, label]) => [label.toLowerCase(), key]),
) as Record<string, string>;

export const UNASSIGNED_TEAM_LABEL = "Unassigned team";
export const UNASSIGNED_REPO_LABEL = "Unassigned repo";
export const UNASSIGNED_THEME_LABEL = "Unassigned theme";
export const UNASSIGNED_SUBCATEGORY_LABEL = "Unassigned subcategory";
export const OTHER_REPOS_LABEL = "Other repos";
export const TOP_N_REPOS = 12;

/**
 * Title case a string, converting underscores/hyphens to spaces.
 * Re-exported from shared utils for backward compatibility.
 */
export const titleCase = sharedTitleCase;

/**
 * Normalize a theme key to its canonical form.
 */
export const normalizeThemeKey = (value: string | null): string | null => {
    if (!value) {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    const lower = trimmed.toLowerCase();
    if (THEME_LABELS[lower]) {
        return lower;
    }
    if (THEME_KEYS_BY_LABEL[lower]) {
        return THEME_KEYS_BY_LABEL[lower];
    }
    const slug = lower.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return slug || null;
};

/**
 * Format a subcategory label, optionally including the theme prefix.
 */
export const formatSubcategoryLabel = (value: string, includeTheme = true): string => {
    if (!value.includes(".")) {
        return titleCase(value);
    }
    const [theme, sub] = value.split(".", 2);
    const subLabel = titleCase(sub ?? value);
    if (!includeTheme) {
        return subLabel;
    }
    return `${titleCase(theme)} · ${subLabel}`;
};

/**
 * Normalize labels containing "unassigned" to consistent canonical labels.
 */
export const normalizeUnassignedLabel = (value: string, group?: string): string => {
    const trimmed = value.trim();
    if (!trimmed) {
        return value;
    }
    const lower = trimmed.toLowerCase();
    if (!lower.includes("unassigned")) {
        return trimmed;
    }
    if (group === "team") return UNASSIGNED_TEAM_LABEL;
    if (group === "repo") return UNASSIGNED_REPO_LABEL;
    if (group === "category") return UNASSIGNED_THEME_LABEL;
    if (group === "subcategory") return UNASSIGNED_SUBCATEGORY_LABEL;
    return trimmed;
};

/**
 * Strip Sankey node prefixes (team:, repo:, category:, subcategory:).
 */
export const stripSankeyPrefix = (value: string): string =>
    value.replace(/^(team|repo|subcategory|category):\s*/i, "");

/**
 * Check if a label indicates unassigned status.
 */
export const isUnassignedLabel = (value: string): boolean =>
    value.toLowerCase().includes("unassigned");

// ============================================================================
// Time range utilities
// ============================================================================

/**
 * Build an optional time range label from start/end dates.
 */
export const buildOptionalTimeRangeLabel = (start?: string, end?: string): string | null => {
    if (!start || !end) return null;
    const startLabel = formatTimestamp(start);
    const endLabel = formatTimestamp(end);
    if (startLabel === "Unavailable" || endLabel === "Unavailable") {
        return null;
    }
    return `${startLabel} – ${endLabel}`;
};

/**
 * Build a time range label from start/end dates.
 */
export const buildTimeRangeLabel = (start?: string, end?: string): string => {
    const startLabel = formatTimestamp(start ?? null);
    const endLabel = formatTimestamp(end ?? null);
    return `${startLabel} – ${endLabel}`;
};

// ============================================================================
// Work unit formatting utilities
// ============================================================================

/**
 * Format evidence quality band label.
 */
export const formatBandLabel = (band: WorkUnitInvestment["evidence_quality"]["band"]): string =>
    titleCase((band ?? "").replace("_", " "));

/**
 * Format a quality value.
 */
export const formatQuality = (value: number): string =>
    formatNumber(value, { maximumFractionDigits: 2 });

export const capitalizeFirst = (text: string): string =>
    text.charAt(0).toUpperCase() + text.slice(1);

/** The unit of an Investment mix value: the mix is requested with measure ISSUE_SIZE. */
export const ISSUE_SIZE_UNIT = "issue size";

/**
 * A work unit's change set (lines changed) as a plain fact of the unit, for evidence and context
 * sections only. It is never an Investment measure: no mix unit, no total, no share, no weight,
 * no sort key. Read from the served `change_set`; null when any row has none. The split is kept
 * only when every row serves it.
 */
export type WorkUnitChangeSet = {
    additions: number | null;
    deletions: number | null;
    total: number;
};

export const workUnitChangeSet = (
    rows: ReadonlyArray<WorkUnitInvestment>,
): WorkUnitChangeSet | null => {
    if (rows.length === 0 || rows.some((row) => !row.change_set)) return null;
    const sets = rows.map((row) => row.change_set as WorkUnitChangeSet);
    const split = sets.every((set) => set.additions !== null && set.deletions !== null);
    return {
        additions: split ? sets.reduce((sum, set) => sum + (set.additions ?? 0), 0) : null,
        deletions: split ? sets.reduce((sum, set) => sum + (set.deletions ?? 0), 0) : null,
        total: sets.reduce((sum, set) => sum + set.total, 0),
    };
};

/** "N lines", or "-x / +y" when additions and deletions are both served. */
export const formatChangeSet = (set: WorkUnitChangeSet): string =>
    set.additions !== null && set.deletions !== null
        ? `-${formatNumber(set.deletions)} / +${formatNumber(set.additions)}`
        : `${formatNumber(set.total)} lines`;

/** A served unit that names lines of code, hours, churn or effort: never an investment value. */
export const isNonCountUnit = (unit: string | null | undefined): boolean =>
    Boolean(unit) && /\b(loc|lines?|hours?|churn|effort)\b/i.test((unit ?? "").replace(/_/g, " "));

/**
 * Format a work unit's display label.
 */
export const formatWorkUnitLabel = (unit: WorkUnitInvestment): string => {
    const candidates = [unit.work_unit_name, unit.display_name, unit.title, unit.summary]
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean);

    if (candidates.length) {
        return candidates[0];
    }

    return "Work unit";
};

/**
 * Format a work unit's type label.
 */
export const formatWorkUnitTypeLabel = (unit: WorkUnitInvestment): string => {
    const primary = typeof unit.work_unit_type === "string" ? unit.work_unit_type.trim() : "";
    const fallback = typeof unit.item_type === "string" ? unit.item_type.trim() : "";
    const value = primary || fallback;
    if (!value) return "";
    return titleCase(value.replace(/_/g, " "));
};

// ============================================================================
// Color utilities
// ============================================================================

/**
 * Clamp a value between min and max.
 */
export const clamp = (value: number, min = 0, max = 1): number =>
    Math.min(max, Math.max(min, value));

/**
 * Adjust a hex color by an amount.
 */
export const adjustHex = (hex: string, amount: number): string => {
    const normalized = hex.replace("#", "");
    if (normalized.length !== 6) {
        return hex;
    }
    const value = Number.parseInt(normalized, 16);
    const clampChannel = (channel: number) => Math.max(0, Math.min(255, channel));
    const r = clampChannel((value >> 16) + amount);
    const g = clampChannel(((value >> 8) & 0xff) + amount);
    const b = clampChannel((value & 0xff) + amount);
    return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
};

/**
 * Calculate baseline filters for comparison (shift back by the same duration).
 */
export const getBaselineFilters = (filters: MetricFilter): MetricFilter => {
    const { start_date, end_date, range_days } = filters.time;
    let baselineStart: string;
    let baselineEnd: string;

    if (start_date && end_date) {
        const start = new Date(start_date);
        const end = new Date(end_date);
        const durationMs = end.getTime() - start.getTime();
        // Shift back by duration + 1 day
        const bEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
        const bStart = new Date(bEnd.getTime() - durationMs);
        baselineStart = bStart.toISOString().split("T")[0];
        baselineEnd = bEnd.toISOString().split("T")[0];
    } else {
        const shownStart = new Date(`${buildDateRange(filters).startDate}T00:00:00Z`).getTime();
        const bEnd = new Date(shownStart - 24 * 60 * 60 * 1000);
        const bStart = new Date(bEnd.getTime() - (range_days - 1) * 24 * 60 * 60 * 1000);
        baselineStart = bStart.toISOString().split("T")[0];
        baselineEnd = bEnd.toISOString().split("T")[0];
    }

    return {
        ...filters,
        time: {
            ...filters.time,
            start_date: baselineStart,
            end_date: baselineEnd,
        },
    };
};
