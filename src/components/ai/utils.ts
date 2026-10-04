import { bucketEquals, bucketKey } from "@/lib/ai/buckets";
import type {
    AiImpactBucketRow,
    AiImpactBucketTotals,
    AiLeverageComponents,
} from "@/lib/graphql/__generated__/types";

/**
 * GraphQL INPUT enum vocabulary (`AIAttributionBucketInput`) — uppercase wire
 * values used in filter variables sent to the backend. Row OUTPUTS
 * (`bucket: String!`) are lowercase snake_case; never compare them to these
 * literals raw — use `bucketEquals`/`bucketKey` (CHAOS-2225).
 */
export const AI_BUCKETS = [
    "AI_ASSISTED",
    "AI_REVIEW",
    "AGENT_CREATED",
    "HUMAN",
    "UNKNOWN",
] as const;

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

/**
 * Compute a ratio guarded against zero / missing denominators. Returns
 * null when the ratio cannot be expressed, which `formatPercent` renders
 * as “—”. Avoids the `denom ?? 1` antipattern that silently treats a
 * missing denominator as 1 and emits absurd percents like 1200.0%.
 */
export function safeRatio(numerator?: number | null, denominator?: number | null): number | null {
    if (numerator == null || denominator == null) return null;
    if (denominator === 0) return null;
    return numerator / denominator;
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

/**
 * One fixed color per attribution bucket, shared by the Impact donut and the attribution badge
 * (`AIAttributionBadge`: its dot uses the same chart colors). Human and Unknown use the muted ink.
 */
const BUCKET_COLOR: Record<string, { colorIndex?: number; muted?: boolean }> = {
    ai_assisted: { colorIndex: 1 },
    ai_review: { colorIndex: 2 },
    agent_created: { colorIndex: 6 },
    human: { muted: true },
    unknown: { muted: true },
};

export function assistedWorkShareRows(rows: AiImpactBucketTotals[]) {
    const assistedBuckets = new Set<string>(AI_BUCKETS.map(bucketKey));
    return rows
        .filter((row) => assistedBuckets.has(bucketKey(row.bucket)))
        .map((row) => ({
            name: bucketLabel(row.bucket),
            value: row.prsTotal,
            ...BUCKET_COLOR[bucketKey(row.bucket)],
        }));
}

/**
 * A calendar day ("2026-05-05") as a short date ("May 5"), in UTC so the label is the served day.
 * It lives in this neutral module: a server-safe helper must not be imported from a "use client"
 * file (and that file imports this one).
 */
export function formatReviewTrendDay(day: string) {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
    }).format(new Date(`${day}T00:00:00Z`));
}

/**
 * One point per agent_created row, labelled with the row's calendar date (CHAOS-7983, A2). Rows are
 * per repository, team and bucket, so a date can repeat: points are never summed per day (a
 * repository with two owning teams would count a PR twice, and the web cannot tell). A row without a
 * `day` keeps its 1-based row index as the label rather than getting a made-up date.
 */
export function agentCreatedTrend(rows: AiImpactBucketRow[]) {
    return rows
        .filter((row) => bucketEquals(row.bucket, "AGENT_CREATED"))
        .map((row, index) =>
            row.day
                ? // `day` is the chart's sort key (ISO, so the line runs in date order); `label` is what the axis shows.
                  { day: row.day, label: formatReviewTrendDay(row.day), value: row.prsTotal }
                : { day: String(index + 1), value: row.prsTotal },
        );
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
