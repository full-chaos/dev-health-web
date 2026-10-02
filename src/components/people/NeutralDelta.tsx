import { formatDelta } from "@/lib/formatters";

/**
 * A person's change on a tile (decision P4 = A): neutral color with an arrow, never green or red.
 * A single-person page shows signals, not judgment, so the change carries no good / bad tone.
 * A missing prior period reads "No prior period", never 0.
 */
export function NeutralDelta({ value }: { value: number | null | undefined }) {
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
