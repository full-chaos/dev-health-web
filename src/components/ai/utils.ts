import type { AiImpactBucketRow, AiImpactBucketTotals, AiLeverageComponents } from "@/lib/graphql/__generated__/types";

export const AI_BUCKETS = ["AI_ASSISTED", "AI_REVIEW", "AGENT_CREATED", "HUMAN", "UNKNOWN"] as const;

export function bucketLabel(bucket: string): string {
  return bucket
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatPercent(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function formatNumber(value?: number | null, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

export function formatSigned(value?: number | null, suffix = ""): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}${suffix}`;
}

export function assistedWorkShareRows(rows: AiImpactBucketTotals[]) {
  const assistedBuckets = new Set(["AI_ASSISTED", "AI_REVIEW", "AGENT_CREATED", "HUMAN", "UNKNOWN"]);
  return rows
    .filter((row) => assistedBuckets.has(row.bucket))
    .map((row) => ({ name: bucketLabel(row.bucket), value: row.prsTotal }));
}

export function agentCreatedTrend(rows: AiImpactBucketRow[]) {
  return rows
    .filter((row) => row.bucket === "AGENT_CREATED")
    .map((row, index) => ({ day: String(index + 1), value: row.prsTotal }));
}

export function leverageSeries(components?: AiLeverageComponents | null) {
  return [
    { label: "PR volume", value: components?.prsComponent ?? 0 },
    { label: "Cycle", value: components?.cycleTimeComponent ?? 0 },
    { label: "Review", value: components?.reviewComponent ?? 0 },
    { label: "Rework", value: components?.reworkComponent ?? 0 },
    { label: "Test", value: components?.testComponent ?? 0 },
    { label: "Incident", value: components?.incidentComponent ?? 0 },
  ];
}
