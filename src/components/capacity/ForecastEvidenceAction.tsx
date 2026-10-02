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

import { formatForecastDate } from "./ForecastTiles";

const daysText = (days: number | undefined) =>
    typeof days === "number" ? `${days} ${days === 1 ? "day" : "days"}` : undefined;

/** The percentile as the tile shows it: the date, then the days. Undefined when not served. */
const percentile = (date: string | undefined, days: number | undefined) =>
    date ? [formatForecastDate(date), daysText(days)].filter(Boolean).join(" · ") : undefined;

/** The page's served values for the evidence drawer, as the tiles and the inputs card show them. */
export function forecastFacts(forecast: CapacityForecast): PageFact[] {
    return [
        {
            label: "Remaining work",
            value: `${forecast.backlogSize} ${forecast.backlogSize === 1 ? "item" : "items"}`,
        },
        { label: "P50 · optimistic", value: percentile(forecast.p50Date, forecast.p50Days) },
        { label: "P85 · target", value: percentile(forecast.p85Date, forecast.p85Days) },
        { label: "P95 · conservative", value: percentile(forecast.p95Date, forecast.p95Days) },
        { label: "Mean throughput", value: `${forecast.throughputMean.toFixed(1)} items/day` },
        { label: "Standard deviation", value: `${forecast.throughputStddev.toFixed(1)} items/day` },
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
