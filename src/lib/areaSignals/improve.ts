import type { MetricFilter } from "@/lib/filters/types";
import { getAreaById } from "@/lib/navigation/areas";

import type { AreaSignal } from "./types";

export function getImproveSignals(
    filters: MetricFilter,
    isTestMode = false,
): Promise<AreaSignal[]> {
    void filters;
    void isTestMode;
    const improve = getAreaById("improve");
    const opportunities = improve?.hubItems.find((item) => item.id === "opportunities");
    if (!opportunities) return Promise.resolve([]);

    return Promise.resolve([
        {
            id: opportunities.id,
            label: opportunities.label,
            href: opportunities.href,
            metricLabel:
                opportunities.metricLabel ?? opportunities.description ?? opportunities.label,
            value: "",
            state: "unavailable",
            demoted: opportunities.demoted,
        },
    ]);
}
