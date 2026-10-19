import { formatMetricParts } from "@/lib/formatters";
import type { CockpitSignal, MetricDelta } from "@/lib/types";

/**
 * The prior value a Home signal shows. The served signal string wins. Without one, the metric's
 * measured prior (CHAOS-9817) is drawn: a stored 0 is "0", null (no prior stored) and an absent
 * field (an older API) draw nothing.
 */
export function signalPriorText(
    signal: Pick<CockpitSignal, "prior_value">,
    delta: Pick<MetricDelta, "prior_value" | "unit" | "has_prior_data"> | undefined,
): string | null {
    if (signal.prior_value != null && signal.prior_value !== "") return signal.prior_value;
    if (!delta || delta.has_prior_data === false) return null;
    const prior = delta.prior_value;
    if (typeof prior !== "number" || !Number.isFinite(prior)) return null;
    const parts = formatMetricParts(prior, delta.unit ?? "");
    return [parts.value, parts.unit].filter(Boolean).join(" ");
}
