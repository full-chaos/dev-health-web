import type { MeterRow } from "@/components/ui/MeterRows";
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

const labelAt = (labels: Labels | undefined, index: number, fallback: string) => ({
    label: labels?.labels[index] ?? fallback,
    title: labels?.titles[index],
});

/**
 * "Likely associations" as meter rows (prototype `bars()`). The text is the served signed percent
 * change. With `signed` (the K-5 views: Flow, Quality, Evidence, Incident Correlation) the row
 * carries the SIGNED change, for `MeterRows signed` to draw from a zero line (right = increase,
 * left = decrease); without it the row carries |change| for an unsigned bar (Bottlenecks).
 */
export function associationMeterRows(
    drivers: Contributor[],
    labels?: Labels,
    options: { signed?: boolean } = {},
): MeterRow[] {
    return drivers.map((driver, index) => ({
        key: driver.id,
        ...labelAt(labels, index, driver.label),
        value: options.signed ? driver.delta_pct : Math.abs(driver.delta_pct),
        display: signedPercent(driver.delta_pct),
    }));
}

/** "Primary contributors" as meter rows: the served values, each with the served unit. */
export function contributorMeterRows(
    contributors: Contributor[],
    unit: string | undefined,
    labels?: Labels,
): MeterRow[] {
    return contributors.map((contributor, index) => ({
        key: contributor.id,
        ...labelAt(labels, index, contributor.label),
        value: contributor.value,
        display: unit ? formatMetricValue(contributor.value, unit) : undefined,
    }));
}
