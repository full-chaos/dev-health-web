import type { AreaSignal } from "./types";

/**
 * A card whose backing read FAILED says so; a read that answered with nothing keeps the empty state
 * (CHAOS-8168 / CHAOS-8269). `sources` maps a card id to the reads it depends on; a card that has no
 * value (`unavailable`) and any of whose reads failed is marked `failed`. A card with a value is never
 * touched, so one failed read cannot hide a value another read served.
 */
export function markFailedSignals(
    signals: AreaSignal[],
    sources: Record<string, readonly string[]>,
    failedSources: ReadonlySet<string>,
): AreaSignal[] {
    return signals.map((signal) =>
        signal.state === "unavailable" &&
        (sources[signal.id] ?? []).some((source) => failedSources.has(source))
            ? { ...signal, failed: true }
            : signal,
    );
}
