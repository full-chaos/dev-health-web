"use client";

import type { CapacityForecast } from "@/lib/graphql/types";

type ForecastCardProps = {
  forecast: CapacityForecast | null;
  loading?: boolean;
  error?: Error | null;
};

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 animate-pulse">
      <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4" />
      <div className="space-y-3">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
      </div>
    </div>
  );
}

function ErrorCard({ error }: { error: Error }) {
  return (
    <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6">
      <h3 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">
        Forecast Unavailable
      </h3>
      <p className="text-sm text-red-600 dark:text-red-300">{error.message}</p>
    </div>
  );
}

function EmptyCard() {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2">
        No Forecast Available
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Insufficient throughput history to generate a forecast. Need at least 14 days of data.
      </p>
    </div>
  );
}

export function ForecastCard({ forecast, loading, error }: ForecastCardProps) {
  if (loading) return <SkeletonCard />;
  if (error) return <ErrorCard error={error} />;
  if (!forecast) return <EmptyCard />;

  const { insufficientHistory, highVariance } = forecast;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Capacity Forecast
        </h3>
        {forecast.teamId && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Team: {forecast.teamId}
          </span>
        )}
      </div>

      <div className="mb-4">
        <span className="text-sm text-gray-500 dark:text-gray-400">Backlog</span>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {forecast.backlogSize} <span className="text-base font-normal">items</span>
        </p>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
          <span className="text-sm text-gray-600 dark:text-gray-300">50% chance</span>
          <div className="text-right">
            <span className="font-medium text-green-600 dark:text-green-400">
              {formatDate(forecast.p50Date)}
            </span>
            {forecast.p50Days && (
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                ({forecast.p50Days} days)
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 bg-amber-50 dark:bg-amber-900/20 -mx-2 px-2 rounded">
          <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
            85% chance
          </span>
          <div className="text-right flex items-center">
            <span className="font-bold text-amber-700 dark:text-amber-300">
              {formatDate(forecast.p85Date)}
            </span>
            {forecast.p85Days && (
              <span className="text-xs text-amber-600 dark:text-amber-400 ml-2">
                ({forecast.p85Days} days)
              </span>
            )}
            <span className="ml-2 text-xs bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 px-1.5 py-0.5 rounded">
              Target
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-gray-600 dark:text-gray-300">95% chance</span>
          <div className="text-right">
            <span className="font-medium text-red-600 dark:text-red-400">
              {formatDate(forecast.p95Date)}
            </span>
            {forecast.p95Days && (
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                ({forecast.p95Days} days)
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">Throughput</span>
          <span className="text-gray-700 dark:text-gray-200">
            {forecast.throughputMean.toFixed(1)} ± {forecast.throughputStddev.toFixed(1)}{" "}
            <span className="text-gray-500 dark:text-gray-400">items/day</span>
          </span>
        </div>
        <div className="flex items-center justify-between text-sm mt-1">
          <span className="text-gray-500 dark:text-gray-400">History</span>
          <span className="text-gray-700 dark:text-gray-200">{forecast.historyDays} days</span>
        </div>
      </div>

      {(insufficientHistory || highVariance) && (
        <div className="mt-4 space-y-2">
          {insufficientHistory && (
            <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
              <span className="shrink-0">⚠️</span>
              <span>Limited history available. Forecast may be less reliable.</span>
            </div>
          )}
          {highVariance && (
            <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
              <span className="shrink-0">⚠️</span>
              <span>High throughput variance detected. Consider using more history days.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
