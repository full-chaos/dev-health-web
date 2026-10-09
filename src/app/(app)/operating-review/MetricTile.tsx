import { MetricCard } from "@/components/metrics/MetricCard";
import { formatMetricValue as fmtMetric } from "@/lib/formatters";
import type { OperatingReviewMetric } from "@/lib/graphql/types";
import { metricDisplay, noDataText } from "@/lib/metrics/metricDisplay";
import { STATUS_PILL, type StatusPillTone } from "@/lib/statusPill";

/**
 * Fill and text of a status chip: the status pill's classes without its border
 * (these chips never had one). Derived from `STATUS_PILL`, so the two cannot
 * drift; the literal classes live in `lib/statusPill.ts`.
 */
const statusTint = (tone: StatusPillTone) =>
    STATUS_PILL[tone]
        .split(" ")
        .filter((cls) => !cls.startsWith("border-"))
        .join(" ");
export const TINT = {
    improved: statusTint("positive"),
    worsened: statusTint("negative"),
    changed: statusTint("info"),
} as const;

/** The note on a metric whose value is the whole organization's while a team is selected. */
export const WHOLE_ORGANIZATION = "Whole organization";

function formatSigned(value: number, unit: string): string {
    // Object.is distinguishes -0 from +0 so we never emit "+0"
    const sign = Object.is(value, 0) || Object.is(value, -0) ? "" : value > 0 ? "+" : "";
    return `${sign}${fmtMetric(value, unit)}`;
}

function statusClass(status: string): string {
    const base = "rounded-full px-2 py-1 text-xs font-medium capitalize";
    if (status === "improved") return `${base} ${TINT.improved}`;
    if (status === "worsened") return `${base} ${TINT.worsened}`;
    if (status === "changed") return `${base} ${TINT.changed}`;
    return `${base} bg-muted text-muted-foreground`;
}

/**
 * `narrow`: five or more cards share a row, so a label can run under a top-right pill. The pill
 * then sits in the flow, before the prior-period line.
 *
 * `teamSelected`: the page has a team selection. A metric the API marks as the whole
 * organization's (`scope`) then gets the note "Whole organization", so its value is not read as
 * the selection's. With no selection every value is the organization's and no note is drawn.
 */
export function MetricTile({
    metric,
    narrow,
    teamSelected = false,
}: {
    metric: OperatingReviewMetric;
    narrow: boolean;
    teamSelected?: boolean;
}) {
    // The served flags (CHAOS-8115). An answer with no flag (an API before it) counts as data.
    // A served rateState that is not "measured" counts as no value, whatever the flag says.
    const hasData = metricDisplay({
        has_data: metric.hasData,
        rate_state: metric.rateState,
    }).hasData;
    const hasPriorData = metric.delta.hasPriorData !== false;
    // The served change and status compare two stored values only when both weeks have one.
    const comparable = hasData && hasPriorData;
    return (
        <MetricCard
            testId="operating-review-metric"
            label={metric.label}
            // With no stored value the served number is a 0 placeholder: never drawn as 0.
            value={hasData ? metric.value : undefined}
            valueText={hasData ? undefined : noDataText(metric.key, metric.rateState)}
            valueIsMessage={!hasData}
            unit={hasData ? metric.unit : undefined}
            caption={
                teamSelected && metric.scope === "ORGANIZATION" ? WHOLE_ORGANIZATION : undefined
            }
            hideTrend
            deltaSlot={
                <>
                    {comparable ? (
                        <span
                            data-testid="operating-review-metric-status"
                            className={`${narrow ? "mr-2" : "absolute right-4 top-4"} ${statusClass(metric.delta.status)}`}
                        >
                            {metric.delta.status}
                        </span>
                    ) : null}
                    <span>
                        {hasPriorData
                            ? `Prior: ${fmtMetric(metric.delta.priorValue, metric.unit)}`
                            : "No prior period"}
                        {comparable ? (
                            <>
                                {" "}
                                · Δ {formatSigned(metric.delta.absolute, metric.unit)}
                                {metric.delta.percent === null || metric.delta.percent === undefined
                                    ? ""
                                    : ` (${formatSigned(metric.delta.percent, "%")})`}
                            </>
                        ) : null}
                    </span>
                </>
            }
        />
    );
}
