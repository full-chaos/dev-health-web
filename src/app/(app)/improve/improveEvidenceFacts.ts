import type { PageFact } from "@/components/evidence/PageFactsEvidenceAction";
import type { AreaSignal } from "@/lib/areaSignals/types";

/**
 * The Improve overview's served signals as fact rows for its "View evidence" header action: label,
 * value and metric as the cards show them. A signal with no data has no value ("Not reported"); one
 * whose read FAILED reads "Could not be read", as its card does (CHAOS-8269).
 */
export function improveFacts(signals: readonly AreaSignal[]): PageFact[] {
    return signals.map((signal) => ({
        label: signal.label,
        value: signal.failed
            ? "Could not be read"
            : signal.state === "unavailable"
              ? undefined
              : `${signal.value} · ${signal.metricLabel}`,
    }));
}
