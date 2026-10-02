import { formatDelta, formatMetricValue } from "@/lib/formatters";

type ReadTheSignalProps = {
    /** The metric's label (already resolved by the page). */
    label: string;
    value: number | null | undefined;
    unit: string;
    /** Percent change against the previous window, as persisted. */
    deltaPct: number | null | undefined;
};

/**
 * Headline word from the DISPLAYED delta: "unchanged" only when the Snapshot card's own formatter
 * shows 0%; otherwise the sign of the persisted delta. A missing delta is "unavailable", never 0.
 */
export const signalDirection = (
    deltaPct: number | null | undefined,
): "up" | "down" | "unchanged" | "unavailable" => {
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
export function ReadTheSignal({ label, value, unit, deltaPct }: ReadTheSignalProps) {
    const direction = signalDirection(deltaPct);
    const headline =
        direction === "unavailable"
            ? `${label}: change unavailable`
            : direction === "unchanged"
              ? `${label} appears unchanged`
              : `${label} appears ${direction}`;
    const hasValue = typeof value === "number" && Number.isFinite(value);

    return (
        <section
            className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5"
            aria-label="Read the signal"
            data-testid="read-the-signal"
        >
            <h2 className="font-(--font-display) text-xl">Read the signal</h2>
            <p className="mt-3 text-xs uppercase tracking-[0.15em] text-(--ink-muted)">{label}</p>
            <p className="mt-1 text-2xl font-semibold" data-testid="signal-headline">
                {headline}
            </p>
            <p className="mt-3 text-sm text-(--ink-muted)" data-testid="signal-numbers">
                {hasValue && direction !== "unavailable"
                    ? `The evidence page shows ${formatMetricValue(value as number, unit)} and a ${formatDelta(deltaPct as number)} change over the selected window.`
                    : hasValue
                      ? `The evidence page shows ${formatMetricValue(value as number, unit)}; the change against the previous window is unavailable.`
                      : "The value for this window is unavailable."}
            </p>
            <div className="mt-4 border-l-2 border-(--card-stroke) pl-3 text-xs leading-relaxed text-(--ink-muted)">
                <strong className="text-(--ink)">Inspect before interpreting.</strong> Use the
                source explanation and contributing artifacts rather than treating a percentage
                change as a causal diagnosis.
            </div>
        </section>
    );
}
