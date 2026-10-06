"use client";

import {
    PageFactsEvidenceAction,
    type PageFact,
} from "@/components/evidence/PageFactsEvidenceAction";
import { useCapacityForecast } from "@/lib/graphql/hooks";
import { useOrgId } from "@/lib/graphql/provider";
import type { MetricFilter } from "@/lib/filters/types";
import type { CapacityForecast } from "@/lib/graphql/types";
import { capacityForecastInput } from "@/components/work/capacityInput";

import { itemsPerDay } from "./ForecastInputsCard";
import { PERCENTILE_ROLE, percentileText, servedHorizon } from "./ForecastTiles";

/**
 * The percentile as the tile shows it: the date, then the days; at the horizon of the simulation
 * "365 days or more" and no date. Undefined when not served.
 */
const percentile = (date: string | undefined, days: number | undefined, horizon: number | null) => {
    const { value, caption } = percentileText(date, days, horizon);
    return value ? [value, caption].filter(Boolean).join(" · ") : undefined;
};

/** The page's served values for the evidence drawer, as the tiles and the inputs card show them. */
export function forecastFacts(forecast: CapacityForecast): PageFact[] {
    const horizon = servedHorizon(forecast);
    return [
        {
            label: "Remaining work",
            value: `${forecast.backlogSize} ${forecast.backlogSize === 1 ? "item" : "items"}`,
        },
        {
            label: `P50 · ${PERCENTILE_ROLE.P50}`,
            value: percentile(forecast.p50Date, forecast.p50Days, horizon),
        },
        {
            label: `P85 · ${PERCENTILE_ROLE.P85}`,
            value: percentile(forecast.p85Date, forecast.p85Days, horizon),
        },
        {
            label: `P95 · ${PERCENTILE_ROLE.P95}`,
            value: percentile(forecast.p95Date, forecast.p95Days, horizon),
        },
        { label: "Mean throughput", value: itemsPerDay(forecast.throughputMean) },
        { label: "Standard deviation", value: itemsPerDay(forecast.throughputStddev) },
        { label: "History", value: `${forecast.historyDays} days` },
    ];
}

/**
 * "View evidence" for Completion Forecast. It reads the same forecast the page shows (same query
 * and input, so the client cache answers: no second request). Nothing is drawn while there is no
 * forecast.
 */
export function ForecastEvidenceAction({
    filters,
    orgId: propOrgId,
}: {
    filters: MetricFilter;
    orgId?: string;
}) {
    const contextOrgId = useOrgId();
    const { data } = useCapacityForecast({
        orgId: propOrgId || contextOrgId || "",
        input: capacityForecastInput(filters),
    });
    if (!data) return null;
    return <PageFactsEvidenceAction title="Completion forecast" facts={forecastFacts(data)} />;
}
