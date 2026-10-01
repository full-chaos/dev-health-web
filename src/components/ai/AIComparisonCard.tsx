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

export function AIComparisonCard({
    label,
    aiSide,
    baselineSide,
    delta,
    metric,
    percent = true,
}: AIComparisonCardProps) {
    const aiValue = aiSide?.[metric] ?? null;
    const baselineValue = baselineSide?.[metric] ?? null;
    const format = percent
        ? formatPercent
        : (value?: number | null) => (value == null ? "—" : value.toFixed(2));
    const spark = [baselineValue ?? 0, aiValue ?? 0];

    const hasDelta = typeof delta === "number" && Number.isFinite(delta);

    return (
        <div className="rounded-(--radius-md) border border-(--card-stroke) bg-card p-4.75">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-label-caps uppercase text-(--ink-muted)">{label}</p>
                    <p className="mt-2 text-[1.75rem] font-semibold leading-tight tabular-nums">
                        {format(aiValue)}
                    </p>
                </div>
                {hasDelta ? (
                    // A real delta: above zero is the caution tone, at or below zero the good tone.
                    // The signed text carries the direction, so color is never the only signal.
                    <span
                        className={`rounded-full px-2 py-1 text-xs ${delta > 0 ? "bg-(--caution)/12 text-(--caution)" : "bg-(--positive)/12 text-(--positive)"}`}
                    >
                        {formatSigned(delta, percent ? " pts" : "")}
                    </span>
                ) : (
                    // No baseline to compare with: a missing delta is not good news (A3).
                    <span className="rounded-full border border-dashed border-(--card-stroke) px-2 py-1 text-xs text-(--ink-muted)">
                        No baseline
                    </span>
                )}
            </div>
            <div className="mt-3 h-16">
                <SparklineChart data={spark} categories={["Baseline", "AI"]} height={64} />
            </div>
            {/* The two ends of the mark, each with its value (A4). */}
            <div className="mt-2 flex justify-between text-xs text-(--ink-muted)">
                <span>
                    Baseline{" "}
                    <span className="tabular-nums text-foreground">{format(baselineValue)}</span>
                </span>
                <span>
                    AI <span className="tabular-nums text-foreground">{format(aiValue)}</span>
                </span>
            </div>
        </div>
    );
}
