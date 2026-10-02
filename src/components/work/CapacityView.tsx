"use client";

import { useMemo } from "react";

import { ForecastInputsCard } from "@/components/capacity/ForecastInputsCard";
import { ForecastNotices } from "@/components/capacity/ForecastNotices";
import { ForecastTiles } from "@/components/capacity/ForecastTiles";
import { ConfidenceBandChart } from "@/components/charts/ConfidenceBandChart";
import { ThroughputHistogram } from "@/components/charts/ThroughputHistogram";
import { DataState } from "@/components/ui/DataState";
import { Notice } from "@/components/ui/Notice";
import { teamIdsForScope } from "@/lib/filters/capacityScope";
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
    const teamCount = teamIdsForScope(filters)?.length ?? 0;

    const chartData = useMemo(() => {
        if (!forecast) return null;
        return {
            backlogSize: forecast.backlogSize,
            p50Days: forecast.p50Days ?? 0,
            p85Days: forecast.p85Days ?? 0,
            p95Days: forecast.p95Days ?? 0,
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
                <Notice variant="danger" live={false} titleAs="h3" title="Forecast Unavailable">
                    {error.message}
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

            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                <div className={CARD}>
                    <h3 className="text-sm font-medium text-foreground">Completion projection</h3>
                    <p className="mb-4 mt-1 text-sm text-(--text-muted)">
                        Monte Carlo forecast for work completion
                    </p>
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
                    ) : (
                        <div className="flex h-80 items-center justify-center text-sm text-(--text-muted)">
                            No forecast data available
                        </div>
                    )}
                </div>

                {forecast ? <ForecastInputsCard forecast={forecast} teamCount={teamCount} /> : null}
            </div>

            {forecast && (
                <div className="grid gap-6 lg:grid-cols-2">
                    <div className={CARD}>
                        <h3 className="mb-4 text-sm font-medium text-foreground">
                            Throughput Distribution
                        </h3>
                        <ThroughputHistogram
                            throughputMean={forecast.throughputMean}
                            throughputStddev={forecast.throughputStddev}
                            height={200}
                        />
                        <p className="mt-3 text-xs text-(--text-muted)">
                            Based on {forecast.historyDays} days of historical data
                        </p>
                    </div>

                    <div className={CARD}>
                        <h3 className="mb-3 text-sm font-medium text-foreground">
                            How to Interpret
                        </h3>
                        <div className="grid gap-3 text-sm text-(--text-muted)">
                            <div>
                                <span className="font-medium text-foreground">P50 (50%)</span>
                                <p className="mt-0.5 text-xs">
                                    Optimistic estimate. Half of simulations complete by this date.
                                </p>
                            </div>
                            <div>
                                <span className="font-medium text-foreground">P85 (85%)</span>
                                <p className="mt-0.5 text-xs">
                                    Recommended target. 85% confidence provides buffer for
                                    variability.
                                </p>
                            </div>
                            <div>
                                <span className="font-medium text-foreground">P95 (95%)</span>
                                <p className="mt-0.5 text-xs">
                                    Conservative estimate. Use for commitments with low risk
                                    tolerance.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
