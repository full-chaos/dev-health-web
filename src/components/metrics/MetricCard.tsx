import Link from "next/link";

import { SparklineChart } from "@/components/charts/SparklineChart";
import { formatDelta, formatMetricValue } from "@/lib/formatters";
import type { SparkPoint } from "@/lib/types";

const deltaTone = (value?: number) => {
  if (value === undefined || value === null) {
    return "text-(--ink-muted)";
  }
  return value > 0
    ? "text-(--accent-3)"
    : value < 0
      ? "text-(--accent-negative)"
      : "text-(--ink-muted)";
};

type MetricCardProps = {
  label: string;
  href: string;
  value?: number;
  unit?: string;
  delta?: number;
  spark?: SparkPoint[];
  caption?: string;
};

export function MetricCard({
  label,
  href,
  value,
  unit,
  delta,
  spark,
  caption,
}: MetricCardProps) {
  const sparkPoints = (spark ?? []).filter((point) =>
    Number.isFinite(point.value)
  );
  const sparkValues = sparkPoints.map((point) => point.value);
  const sparkLabels = sparkPoints.map((point) => point.ts);
  const sparklineValues =
    sparkValues.length === 1 ? [sparkValues[0], sparkValues[0]] : sparkValues;
  const sparklineLabels =
    sparkLabels.length === 1 ? [sparkLabels[0], sparkLabels[0]] : sparkLabels;

  return (
    <Link
      href={href}
      className="group rounded-3xl border border-(--card-stroke) bg-card p-4 transition hover:-translate-y-1 hover:shadow-lg"
    >
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
        <span>{label}</span>
        <span className={deltaTone(delta)}>
          {delta === undefined || delta === null ? "--" : formatDelta(delta)}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-2xl font-semibold">
            {value === undefined || value === null
              ? "--"
              : formatMetricValue(value, unit ?? "")}
          </p>
          <p className="mt-2 text-xs text-(--ink-muted)">
            {caption ?? "Open in Explore"}
          </p>
        </div>
        <div className="h-16 w-28">
          {sparklineValues.length > 1 ? (
            <SparklineChart
              data={sparklineValues}
              categories={sparklineLabels}
              height={64}
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
              Trend
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
