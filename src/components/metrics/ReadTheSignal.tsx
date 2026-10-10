import { Section } from "@/components/ui/Section";
import { changedFromZeroLabel } from "@/components/shared/MetricDelta";
import { noDataText, readDelta } from "@/lib/metrics/metricDisplay";
import { formatDelta, formatMetricValue } from "@/lib/formatters";

type ReadTheSignalProps = {
    /** The metric's label (already resolved by the page). */
    label: string;
    value: number | null | undefined;
    unit: string;
    /** Percent change against the previous window, as persisted. Null: changed from zero. */
    deltaPct: number | null | undefined;
    /** Served flags; an absent flag counts as data. A null percent is "from zero" only with both. */
    hasData?: boolean;
    hasPriorData?: boolean;
};

/**
 * Headline word from the DISPLAYED delta: "unchanged" only when the Snapshot card's own formatter
 * shows 0% for a measured change; otherwise the sign of the served percent. A change that cannot
 * be told (no data, no prior period) is "unavailable", never 0.
 */
export const signalDirection = (
    deltaPct: number | null | undefined,
    fromZero?: number,
): "up" | "down" | "unchanged" | "unavailable" => {
    // Changed from zero: the percent is undefined, the change is real; the sign is the value's.
    if (fromZero !== undefined) return fromZero > 0 ? "up" : "down";
    if (typeof deltaPct !== "number" || !Number.isFinite(deltaPct)) return "unavailable";
    if (formatDelta(deltaPct) === "0%") return "unchanged";
    return deltaPct > 0 ? "up" : "down";
};

/**
 * "Read the signal" (NEW from the approved concept): the metric's direction in plain words, the
 * two persisted numbers behind it, and the reminder that a percentage change is not a diagnosis.
 * No AI call, no new data: value and delta come from the same explain payload as the Snapshot card.
 * Neutral ink only: it states what the data shows, it does not judge it.
 */
export function ReadTheSignal({
    label,
    value,
    unit,
    deltaPct,
    hasData,
    hasPriorData,
}: ReadTheSignalProps) {
    // The flags decide first (a 0 on a side with no data is a placeholder): see `readDelta`.
    const reading = readDelta({
        delta_pct: deltaPct,
        value,
        has_data: hasData,
        has_prior_data: hasPriorData,
    });
    const fromZero = reading.kind === "from-zero";
    const percent = reading.kind === "percent" ? reading.percent : null;
    const direction = signalDirection(
        percent,
        reading.kind === "from-zero" ? reading.value : undefined,
    );
    const headline =
        reading.kind === "no-data"
            ? `${label}: ${noDataText()}`
            : direction === "unavailable"
              ? `${label}: change unavailable`
              : direction === "unchanged"
                ? `${label} appears unchanged`
                : `${label} appears ${direction}`;
    const hasValue = typeof value === "number" && Number.isFinite(value);

    return (
        <Section title="Read the signal" aria-label="Read the signal" data-testid="read-the-signal">
            <p className="text-label-caps uppercase text-(--ink-muted)">{label}</p>
            <p className="mt-1 text-2xl font-semibold" data-testid="signal-headline">
                {headline}
            </p>
            <p className="mt-3 text-sm text-(--ink-muted)" data-testid="signal-numbers">
                {reading.kind === "no-data"
                    ? noDataText()
                    : hasValue && fromZero
                      ? `The evidence page shows ${formatMetricValue(value as number, unit)}, ${changedFromZeroLabel(value as number, unit)}, over the selected window.`
                      : hasValue && direction !== "unavailable"
                        ? `The evidence page shows ${formatMetricValue(value as number, unit)} and a ${formatDelta(percent as number)} change over the selected window.`
                        : hasValue
                          ? `The evidence page shows ${formatMetricValue(value as number, unit)}; the change against the previous window is unavailable.`
                          : "The value for this window is unavailable."}
            </p>
            <div className="mt-4 border-l-2 border-(--card-stroke) pl-3 text-xs leading-relaxed text-(--ink-muted)">
                <strong className="text-(--ink)">Inspect before interpreting.</strong> Use the
                source explanation and contributing artifacts rather than treating a percentage
                change as a causal diagnosis.
            </div>
        </Section>
    );
}
