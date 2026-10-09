import { MetricCard } from "@/components/metrics/MetricCard";
import { NeutralDelta } from "@/components/people/NeutralDelta";
import { isChangedFromZero } from "@/components/shared/MetricDelta";
import { metricCardProps, metricDisplay } from "@/lib/metrics/metricDisplay";
import type { MetricDelta } from "@/lib/types";

type PersonMetricCardProps = {
    delta: MetricDelta;
    href: string;
    /** The summary served no rows: draw the tile with no value and no change. */
    placeholder?: boolean;
};

/**
 * One person-page metric tile. The value and the no-data state come from the shared
 * `metricCardProps` rule; the change keeps the person page's neutral style. Order of states:
 * no data (message, no change line), no prior (value and "No prior period"), changed from zero
 * ("+N unit from 0"), then the number. A measured 0 with data in both windows still draws 0.
 */
export function PersonMetricCard({ delta, href, placeholder = false }: PersonMetricCardProps) {
    const shared = metricCardProps(delta);
    const display = metricDisplay(delta);
    const base = { label: delta.label, href, spark: delta.spark, caption: "Open metric" };

    if (placeholder) {
        return (
            <MetricCard
                {...base}
                unit={delta.unit}
                deltaSlot={<NeutralDelta value={undefined} />}
            />
        );
    }
    if (display.state === "no-data") {
        return <MetricCard {...base} {...shared} />;
    }
    const change = !display.comparable
        ? undefined
        : isChangedFromZero(delta)
          ? null
          : delta.delta_pct;
    return (
        <MetricCard
            {...base}
            value={shared.value}
            unit={shared.unit}
            deltaSlot={
                <NeutralDelta
                    value={change}
                    changedFromZero={
                        change === null ? { current: delta.value, unit: delta.unit } : undefined
                    }
                />
            }
        />
    );
}
