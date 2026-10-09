import type { MeterRow } from "@/components/ui/MeterRows";
import { chartEntityLabel } from "@/lib/labels/entityLabel";
import { changedFromZeroLabel, isChangedFromZero } from "@/components/shared/MetricDelta";
import { formatMetricValue, formatNumber } from "@/lib/formatters";
import type { Contributor } from "@/lib/types";

/**
 * A served percent change with its sign, as an association row shows it ("+10%", "-20%"). A
 * non-zero change that rounds to 0 at one decimal reads "<0.1%" with its sign ("+<0.1%"), never
 * "+0%" (the formatter rule of CHAOS-8174).
 */
export const signedPercent = (value: number) => {
    const sign = value > 0 ? "+" : value < 0 ? "-" : "";
    const digits = formatNumber(Math.abs(value), { maximumFractionDigits: 1 });
    return `${sign}${value !== 0 && digits === "0" ? "<0.1" : digits}%`;
};

type Labels = { labels: string[]; titles: (string | undefined)[] };

// The served `display_name` names the row; without one the label is guarded so an id never shows.
const labelAt = (labels: Labels | undefined, index: number, row: Contributor) => {
    const name = row.display_name?.trim();
    if (name) return { label: name, title: name };
    return {
        label: labels?.labels[index] ?? chartEntityLabel(row.label),
        title: labels?.titles[index],
    };
};

/**
 * "Likely associations" as meter rows (prototype `bars()`). The text is the served signed percent
 * change. With `signed` (the K-5 views: Flow, Quality, Evidence, Incident Correlation) the row
 * carries the SIGNED change, for `MeterRows signed` to draw from a zero line (right = increase,
 * left = decrease); without it the row carries |change| for an unsigned bar (Bottlenecks).
 */
export function associationMeterRows(
    drivers: Contributor[],
    labels?: Labels,
    options: { signed?: boolean; unit?: string } = {},
): MeterRow[] {
    // A percent has no scale for a change from zero (it is unbounded): its bar fills the track
    // (the largest served percent of the rows), and its text says the absolute change.
    const finite = drivers
        .map((d) => d.delta_pct)
        .filter((p): p is number => typeof p === "number" && Number.isFinite(p));
    const fullTrack = Math.max(100, ...finite.map(Math.abs));
    return drivers.map((driver, index) => {
        const base = { key: driver.id, ...labelAt(labels, index, driver) };
        if (isChangedFromZero(driver)) {
            const sign = driver.value < 0 ? -1 : 1;
            return {
                ...base,
                value: options.signed ? sign * fullTrack : fullTrack,
                display: changedFromZeroLabel(driver.value, options.unit),
            };
        }
        // A null percent that is not state 3 (no prior data, or no value) is not reported.
        if (driver.delta_pct === null) return { ...base, value: null, display: undefined };
        return {
            ...base,
            value: options.signed ? driver.delta_pct : Math.abs(driver.delta_pct),
            display: signedPercent(driver.delta_pct),
        };
    });
}

/** "Primary contributors" as meter rows: the served values, each with the served unit. */
export function contributorMeterRows(
    contributors: Contributor[],
    unit: string | undefined,
    labels?: Labels,
): MeterRow[] {
    return contributors.map((contributor, index) => ({
        key: contributor.id,
        ...labelAt(labels, index, contributor),
        value: contributor.value,
        display: unit ? formatMetricValue(contributor.value, unit) : undefined,
    }));
}
