"use client";

import { useMemo, useState, useEffect } from "react";

import { ForecastCard } from "@/components/capacity/ForecastCard";
import { ConfidenceBandChart } from "@/components/charts/ConfidenceBandChart";
import { ThroughputHistogram } from "@/components/charts/ThroughputHistogram";
import { runtimeConfig } from "@/lib/runtimeConfig";
import { useCapacityForecast } from "@/lib/graphql/hooks";
import type { CapacityForecast } from "@/lib/graphql/types";
import type { MetricFilter } from "@/lib/filters/types";

type CapacityViewProps = {
  filters: MetricFilter;
  orgId?: string;
};

const SAMPLE_FORECAST: CapacityForecast = {
  forecastId: "sample-forecast-001",
  computedAt: new Date().toISOString(),
  teamId: "team-alpha",
  workScopeId: "project-main",
  backlogSize: 47,
  targetItems: 47,
  p50Date: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  p85Date: new Date(Date.now() + 19 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  p95Date: new Date(Date.now() + 27 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  p50Days: 12,
  p85Days: 19,
  p95Days: 27,
  throughputMean: 3.2,
  throughputStddev: 1.8,
  historyDays: 90,
  insufficientHistory: false,
  highVariance: false,
};

export function CapacityView({ filters, orgId = "default" }: CapacityViewProps) {
  const useSampleData = runtimeConfig.devHealthTestMode();

  const teamId = filters.scope.level === "team" && filters.scope.ids.length > 0
    ? filters.scope.ids[0]
    : undefined;

  const historyDays = filters.time.range_days ?? 90;

  const [sampleForecast, setSampleForecast] = useState<CapacityForecast | null>(null);

  useEffect(() => {
    if (!useSampleData) return;
    const timer = setTimeout(() => {
      setSampleForecast(SAMPLE_FORECAST);
    }, 500);
    return () => clearTimeout(timer);
  }, [useSampleData]);

  const sampleLoading = useSampleData && sampleForecast === null;

  const {
    data: queryData,
    loading: queryLoading,
    error: queryError,
    refetch,
  } = useCapacityForecast({
    orgId,
    input: { teamId, historyDays },
    pause: useSampleData,
  });

  const forecast = useSampleData ? sampleForecast : queryData;
  const isLoading = useSampleData ? sampleLoading : queryLoading;
  const error = useSampleData ? null : queryError;

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
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Capacity Planning
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Monte Carlo forecast for work completion
          </p>
        </div>
        {!useSampleData && (
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Computing..." : "Refresh Forecast"}
          </button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <ForecastCard forecast={forecast} loading={isLoading} error={error} />

        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-4">
            Completion Projection
          </h3>
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
              <div className="animate-pulse text-sm text-gray-500 dark:text-gray-400">
                Loading chart...
              </div>
            </div>
          ) : (
            <div className="h-[320px] flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
              No forecast data available
            </div>
          )}
        </div>
      </div>

      {forecast && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-4">
              Throughput Distribution
            </h3>
            <ThroughputHistogram
              throughputMean={forecast.throughputMean}
              throughputStddev={forecast.throughputStddev}
              height={200}
            />
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Based on {forecast.historyDays} days of historical data
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">
              How to Interpret
            </h3>
            <div className="grid gap-3 text-sm text-gray-600 dark:text-gray-300">
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
