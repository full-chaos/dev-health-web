import type { PageFact } from "@/components/evidence/PageFactsEvidenceAction";
import { areaOverviewBodyOrder } from "@/components/navigation/areaOverviewEvidence";
import { isAvailable } from "@/lib/areaSignals/sort";
import type { AreaSignal } from "@/lib/areaSignals/types";

/**
 * The Govern overview's served signals as fact rows for its "View evidence" header action, in
 * the order the page body draws them. The order comes from the one shared layout rule of an area
 * overview (`areaOverviewBodyOrder` → `areaOverviewLayout`), so the drawer cannot list the
 * signals in another order than the page.
 *
 * A row is "<sub-area> — <metric>" with the served value exactly as the card shows it; a sub-area
 * with no served value reads "Not reported" (value left out). No number is made here.
 */
export function governEvidenceFacts(signals: readonly AreaSignal[]): PageFact[] {
    return areaOverviewBodyOrder("govern", signals).map((signal) => ({
        label: `${signal.label} — ${signal.metricLabel}`,
        value: isAvailable(signal) && signal.value ? signal.value : undefined,
    }));
}
