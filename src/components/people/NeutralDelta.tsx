import { changedFromZeroLabel } from "@/components/shared/MetricDelta";
import { formatDelta } from "@/lib/formatters";

/**
 * A person's change on a tile (decision P4 = A): neutral color with an arrow, never green or red.
 * A single-person page shows signals, not judgment, so the change carries no good / bad tone.
 * A missing prior period reads "No prior period", never 0. A null percent with both windows
 * measured (`changedFromZero`: the current value and unit) reads "+12 from 0", with no percent.
 */
export function NeutralDelta({
    value,
    changedFromZero,
}: {
    value: number | null | undefined;
    changedFromZero?: { current: number; unit?: string | null };
}) {
    if (
        value === null &&
        changedFromZero &&
        Number.isFinite(changedFromZero.current) &&
        changedFromZero.current !== 0
    ) {
        return (
            <span
                className="inline-flex items-center gap-1 text-(--ink-muted)"
                data-testid="neutral-delta"
            >
                <span aria-hidden="true">{changedFromZero.current > 0 ? "↑" : "↓"}</span>
                <span>{changedFromZeroLabel(changedFromZero.current, changedFromZero.unit)}</span>
            </span>
        );
    }
    if (value === null || value === undefined || Number.isNaN(value)) {
        return <span className="text-(--ink-muted)">No prior period</span>;
    }
    const rounded = Math.round(value);
    const arrow = rounded > 0 ? "↑" : rounded < 0 ? "↓" : "→";
    return (
        <span
            className="inline-flex items-center gap-1 text-(--ink-muted)"
            data-testid="neutral-delta"
        >
            <span aria-hidden="true">{arrow}</span>
            <span>{formatDelta(value)}</span>
        </span>
    );
}
