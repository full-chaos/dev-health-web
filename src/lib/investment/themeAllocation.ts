import type { ReworkThemeAllocation } from "@/lib/types";
import { readSizingCoverage, type SizingReading } from "./coverage";
import { ISSUE_SIZE_UNIT } from "./transforms";

export const WORK_UNITS_UNIT = "work units";

/** The share base is the served denominator; a response without one keeps the served percent. */
export function themeSharePct(row: ReworkThemeAllocation): number {
    const { denominator } = row;
    if (typeof denominator === "number" && Number.isFinite(denominator) && denominator > 0) {
        return (row.allocation / denominator) * 100;
    }
    return row.allocation_pct;
}

export type ThemeMeasureReading = {
    unit: typeof ISSUE_SIZE_UNIT | typeof WORK_UNITS_UNIT;
    /** Present only for ISSUE_SIZE: the sizing coverage is one answer for every row. */
    sizing: SizingReading | null;
};

/** The measure of the tile, or null when no row carries one (a response that predates the field). */
export function readThemeMeasure(rows: ReworkThemeAllocation[]): ThemeMeasureReading | null {
    const row = rows.find((r) => r.measure !== undefined);
    if (!row) {
        return null;
    }
    if (row.measure === "ISSUE_SIZE") {
        return {
            unit: ISSUE_SIZE_UNIT,
            sizing: readSizingCoverage(row.sizing_coverage, row.unsized_unit_count),
        };
    }
    return { unit: WORK_UNITS_UNIT, sizing: null };
}
