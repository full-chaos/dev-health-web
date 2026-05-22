"use client";

import { useMemo } from "react";

import { ForecastCard } from "@/components/capacity/ForecastCard";
import { ConfidenceBandChart } from "@/components/charts/ConfidenceBandChart";
import { ThroughputHistogram } from "@/components/charts/ThroughputHistogram";
import { useCapacityForecast } from "@/lib/graphql/hooks";
import { useOrgId } from "@/lib/graphql/provider";
import type { MetricFilter } from "@/lib/filters/types";

type CapacityViewProps = {
  filters: MetricFilter;
  orgId?: string;
};

export function CapacityView({ filters, orgId: propOrgId }: CapacityViewProps) {
  const contextOrgId = useOrgId();
  const orgId = propOrgId || contextOrgId || "";
  const teamId =
    filters.scope.level === "team" && filters.scope.ids.length > 0
      ? filters.scope.ids[0]
      : undefined;

  const historyDays = filters.time.range_days ?? 90;

  const {
    data: queryData,
    loading: queryLoading,
    error: queryError,
    refetch,
  } = useCapacityForecast({
    orgId,
    input: { teamId, historyDays },
  });

  const forecast = queryData;
  const isLoading = queryLoading;
  const error = queryError;

  const chartData = useMemo(() => {
    if (!forecast) return null;
    return {
      backlogSize: forecast.backlogSize,
      p50Days: forecast.p50Days ?? 0,
      p85Days: forecast.p85Days ?? 0,
      p95Days: forecast.p95Days ?? 0,
      throughputMean: forecast.throughputMean,
    };
  }, [forecast]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Capacity Planning</h2>
          <p className="mt-1 text-sm text-(--ink-muted)">
            Monte Carlo forecast for work completion
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="rounded-lg border border-(--card-stroke) bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-(--card-80) disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Computing..." : "Refresh Forecast"}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <ForecastCard forecast={forecast} loading={isLoading} error={error} />

        <div className="rounded-3xl border border-(--card-stroke) bg-card p-6">
          <h3 className="text-sm font-medium text-foreground mb-4">Completion Projection</h3>
          {chartData ? (
            <ConfidenceBandChart
              backlogSize={chartData.backlogSize}
              p50Days={chartData.p50Days}
              p85Days={chartData.p85Days}
              p95Days={chartData.p95Days}
              throughputMean={chartData.throughputMean}
              height={320}
            />
          ) : isLoading ? (
            <div className="h-[320px] flex items-center justify-center">
              <div className="animate-pulse text-sm text-(--ink-muted)">Loading chart...</div>
            </div>
          ) : (
            <div className="h-[320px] flex items-center justify-center text-sm text-(--ink-muted)">
              No forecast data available
            </div>
          )}
        </div>
      </div>

      {forecast && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-(--card-stroke) bg-card p-6">
            <h3 className="text-sm font-medium text-foreground mb-4">Throughput Distribution</h3>
            <ThroughputHistogram
              throughputMean={forecast.throughputMean}
              throughputStddev={forecast.throughputStddev}
              height={200}
            />
            <p className="mt-3 text-xs text-(--ink-muted)">
              Based on {forecast.historyDays} days of historical data
            </p>
          </div>

          <div className="rounded-3xl border border-(--card-stroke) bg-card p-6">
            <h3 className="text-sm font-medium text-foreground mb-3">How to Interpret</h3>
            <div className="grid gap-3 text-sm text-(--ink-muted)">
              <div>
                <span className="font-medium text-green-600 dark:text-green-400">P50 (50%)</span>
                <p className="mt-0.5 text-xs">
                  Optimistic estimate. Half of simulations complete by this date.
                </p>
              </div>
              <div>
                <span className="font-medium text-amber-600 dark:text-amber-400">P85 (85%)</span>
                <p className="mt-0.5 text-xs">
                  Recommended target. 85% confidence provides buffer for variability.
                </p>
              </div>
              <div>
                <span className="font-medium text-red-600 dark:text-red-400">P95 (95%)</span>
                <p className="mt-0.5 text-xs">
                  Conservative estimate. Use for commitments with low risk tolerance.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
