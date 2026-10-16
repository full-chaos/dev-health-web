import { describeSizing } from "./AllocationCoverage";
import { readThemeMeasure } from "@/lib/investment";
import type { ReworkThemeAllocation } from "@/lib/types";

/** One short line under the theme rows: the measure, and the sizing note when most units are unsized or unmeasured. */
export function ThemeMeasureNote({ rows }: { rows: ReworkThemeAllocation[] }) {
    const reading = readThemeMeasure(rows);
    if (!reading) {
        return null;
    }
    const { sizing } = reading;
    const note =
        sizing && (sizing.state === "not-measured" || sizing.mostlyCount)
            ? describeSizing(sizing).note
            : null;
    return (
        <p className="mt-3 text-xs text-(--ink-muted)" data-testid="theme-measure-note">
            <span data-testid="theme-measure">Share of {reading.unit}.</span>
            {note ? <span data-testid="theme-sizing-note"> {note}</span> : null}
        </p>
    );
}
