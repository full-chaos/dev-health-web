"use client";

import { SparklineChart } from "@/components/charts/SparklineChart";
import type { AiComparisonSide } from "@/lib/graphql/__generated__/types";
import { formatPercent, formatSigned } from "./utils";

type RateMetric = "reviewsPerPr" | "reworkRate" | "testGapRate" | "revertRate" | "incidentRate";

type AIComparisonCardProps = {
  label: string;
  aiSide?: AiComparisonSide | null;
  baselineSide?: AiComparisonSide | null;
  delta?: number | null;
  metric: RateMetric;
  percent?: boolean;
};

export function AIComparisonCard({ label, aiSide, baselineSide, delta, metric, percent = true }: AIComparisonCardProps) {
  const aiValue = aiSide?.[metric] ?? null;
  const baselineValue = baselineSide?.[metric] ?? null;
  const format = percent ? formatPercent : (value?: number | null) => (value == null ? "—" : value.toFixed(2));
  const spark = [baselineValue ?? 0, aiValue ?? 0];

  return (
    <div className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">{label}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{format(aiValue)}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs ${delta && delta > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
          {formatSigned(delta, percent ? " pts" : "")}
        </span>
      </div>
      <div className="mt-3 h-16">
        <SparklineChart data={spark} categories={["Baseline", "AI"]} height={64} />
      </div>
      <p className="mt-2 text-xs text-(--ink-muted)">Baseline {format(baselineValue)} · AI side {format(aiValue)}</p>
    </div>
  );
}
