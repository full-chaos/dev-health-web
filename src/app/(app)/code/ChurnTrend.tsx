import { TimeseriesChart } from "@/components/charts/TimeseriesChart";
import { NOT_REPORTED } from "@/components/evidence/EvidenceFacts";
import { Section } from "@/components/ui/Section";
import { READ_FAILED_MESSAGE } from "@/lib/readFailure";
import type { SparkPoint } from "@/lib/types";

type ChurnTrendProps = {
    /** The read of the page's Home data failed (no answer at all). */
    readFailed: boolean;
    /**
     * The served churn series of the page scope (`home.deltas[churn].spark`): one point per day,
     * stamped with the day. `undefined` = the API served no churn entry.
     */
    spark: SparkPoint[] | undefined;
};

const STATE = "flex h-64 items-center justify-center text-sm text-(--ink-muted)";

/**
 * "Churn trend" (CHAOS-8105): the served daily churn series, drawn as it comes. Nothing is added,
 * summed or filled here: a day with a null value is a gap, a served 0 is a point. The three states
 * stay apart: a failed read, a series that is not served, and a served series with no value.
 */
export function ChurnTrend({ readFailed, spark }: ChurnTrendProps) {
    // The full served stamp orders the points; its date part is the axis label.
    const points = (spark ?? []).map((point) => ({
        day: point.ts,
        label: point.ts.slice(0, 10),
        value: point.value,
    }));
    const hasValue = points.some((point) => point.value !== null);

    return (
        <Section
            data-testid="code-churn-trend"
            title="Churn trend"
            description="Churn is a code-change signal, not an individual performance score."
        >
            {readFailed ? (
                <p data-testid="code-churn-trend-failed" className={STATE}>
                    {READ_FAILED_MESSAGE}
                </p>
            ) : spark === undefined ? (
                <p data-testid="code-churn-trend-not-reported" className={STATE}>
                    {NOT_REPORTED}
                </p>
            ) : !hasValue ? (
                <p data-testid="code-churn-trend-empty" className={STATE}>
                    No data for this window
                </p>
            ) : (
                <div className="h-64">
                    <TimeseriesChart data={points} valueFormat="number" />
                </div>
            )}
        </Section>
    );
}
