"use client";

import { READ_FAILED_MESSAGE } from "@/lib/readFailure";
import { useMemo } from "react";

import { ForecastInputsCard } from "@/components/capacity/ForecastInputsCard";
import { ForecastNotices } from "@/components/capacity/ForecastNotices";
import { ForecastTiles } from "@/components/capacity/ForecastTiles";
import { ConfidenceBandChart } from "@/components/charts/ConfidenceBandChart";
import { ThroughputHistogram } from "@/components/charts/ThroughputHistogram";
import { Inset } from "@/components/capacity/Inset";
import { Section } from "@/components/ui/Section";
import { DataState } from "@/components/ui/DataState";
import { Notice } from "@/components/ui/Notice";
import { useCapacityForecast } from "@/lib/graphql/hooks";
import { useOrgId } from "@/lib/graphql/provider";
import type { MetricFilter } from "@/lib/filters/types";

import { capacityForecastInput } from "./capacityInput";

type CapacityViewProps = {
    filters: MetricFilter;
    orgId?: string;
};

const CARD = "rounded-(--radius-lg) border border-(--border) bg-(--surface) p-6";

export function CapacityView({ filters, orgId: propOrgId }: CapacityViewProps) {
    const contextOrgId = useOrgId();
    const orgId = propOrgId || contextOrgId || "";

    const {
        data: queryData,
        loading: isLoading,
        error,
    } = useCapacityForecast({
        orgId,
        input: capacityForecastInput(filters),
    });

    const forecast = queryData;

    const chartData = useMemo(() => {
        if (!forecast) return null;
        // A day percentile the API did not serve is not zero (CHAOS-8005): the burn chart needs
        // all three, so with one missing there is no chart. A served 0 is a value and is drawn.
        const { p50Days, p85Days, p95Days } = forecast;
        if (
            typeof p50Days !== "number" ||
            typeof p85Days !== "number" ||
            typeof p95Days !== "number"
        ) {
            return null;
        }
        return {
            backlogSize: forecast.backlogSize,
            p50Days,
            p85Days,
            p95Days,
            p50Date: forecast.p50Date,
            p85Date: forecast.p85Date,
            p95Date: forecast.p95Date,
            throughputMean: forecast.throughputMean,
        };
    }, [forecast]);

    return (
        <div className="flex flex-col gap-6">
            {isLoading ? (
                <div
                    data-testid="forecast-loading"
                    className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 animate-pulse"
                >
                    {[0, 1, 2, 3].map((index) => (
                        <div key={index} className={`${CARD} h-28`} />
                    ))}
                </div>
            ) : error ? (
                <Notice variant="danger" live={false} titleAs="h3" title="Forecast unavailable">
                    {READ_FAILED_MESSAGE}
                </Notice>
            ) : forecast ? (
                <>
                    <ForecastNotices forecast={forecast} />
                    <ForecastTiles forecast={forecast} />
                </>
            ) : (
                <DataState
                    variant="insufficient-confidence"
                    title="No Forecast Available"
                    description="Insufficient throughput history to generate a forecast. Need at least 14 days of data."
                    data-testid="forecast-empty"
                />
            )}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <Section
                    title="Completion projection"
                    description="Monte Carlo forecast for work completion"
                >
                    {chartData ? (
                        <>
                            <ConfidenceBandChart
                                backlogSize={chartData.backlogSize}
                                p50Days={chartData.p50Days}
                                p85Days={chartData.p85Days}
                                p95Days={chartData.p95Days}
                                p50Date={chartData.p50Date}
                                p85Date={chartData.p85Date}
                                p95Date={chartData.p95Date}
                                throughputMean={chartData.throughputMean}
                                height={320}
                            />
                            <p className="mt-2 text-xs text-(--text-muted)">
                                Line = backlog burned at the mean throughput; markers = the
                                forecast&apos;s P50 / P85 / P95 days. No distribution is drawn.
                            </p>
                        </>
                    ) : isLoading ? (
                        <div className="flex h-80 items-center justify-center">
                            <div className="animate-pulse text-sm text-(--text-muted)">
                                Loading chart...
                            </div>
                        </div>
                    ) : error ? (
                        <div
                            data-testid="forecast-chart-failed"
                            className="flex h-80 items-center justify-center text-sm text-(--text-muted)"
                        >
                            {READ_FAILED_MESSAGE}
                        </div>
                    ) : forecast ? (
                        <div
                            data-testid="forecast-chart-not-reported"
                            className="flex h-80 flex-col items-center justify-center gap-1 text-sm text-(--text-muted)"
                        >
                            <p>Not reported</p>
                            <p className="text-xs">
                                The forecast has no P50 / P85 / P95 days, so no line is drawn.
                            </p>
                        </div>
                    ) : (
                        <div
                            data-testid="forecast-chart-empty"
                            className="flex h-80 items-center justify-center text-sm text-(--text-muted)"
                        >
                            No data for this window
                        </div>
                    )}
                </Section>

                {forecast ? <ForecastInputsCard forecast={forecast} /> : null}
            </div>

            {forecast && (
                <>
                    <Section title="Interpretation" data-testid="forecast-interpretation">
                        <div className="grid gap-3 md:grid-cols-3">
                            <Inset title="P50 (50%)" className="mt-0">
                                Optimistic estimate. Half of simulations complete by this date.
                            </Inset>
                            <Inset title="P85 (85%)" className="mt-0">
                                Recommended target. 85% confidence provides buffer for variability.
                            </Inset>
                            <Inset title="P95 (95%)" className="mt-0">
                                Conservative estimate. Use for commitments with low risk tolerance.
                            </Inset>
                        </div>
                    </Section>

                    <Section title="Throughput Distribution">
                        <ThroughputHistogram
                            throughputMean={forecast.throughputMean}
                            throughputStddev={forecast.throughputStddev}
                            height={200}
                        />
                        <p className="mt-3 text-xs text-(--text-muted)">
                            Based on {forecast.historyDays} days of historical data
                        </p>
                    </Section>
                </>
            )}
        </div>
    );
}
