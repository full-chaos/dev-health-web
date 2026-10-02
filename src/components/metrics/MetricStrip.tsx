import { Children, isValidElement, type CSSProperties, type ReactNode } from "react";

/**
 * One row of metric tiles with one column per tile (prototype `metrics(arr, cols)`):
 * 5 tiles give 5 columns, 4 give 4, 3 give 3; more than 5 wrap to a new row. Under the `lg` breakpoint it falls
 * back to two columns so tiles stay readable.
 *
 * Joined strip as the approved `.metrics`: 1px seams, one outer border and radius; the tiles lose
 * their own border and radius. Data logic stays in each tile (`MetricCard`).
 * `columns` overrides the count when the caller needs a fixed grid.
 */
export type MetricStripProps = {
    children: ReactNode;
    /** Override the column count. Default: the number of rendered tiles, at most 5. */
    columns?: number;
    className?: string;
    "data-testid"?: string;
};

const MAX_COLUMNS = 5;

export function MetricStrip({
    children,
    columns,
    className = "",
    "data-testid": testId,
}: MetricStripProps) {
    const tiles = Children.toArray(children).filter(isValidElement);
    // One column per tile up to MAX_COLUMNS; more tiles wrap to a new row (never cramped).
    const cols = Math.max(1, columns ?? Math.min(tiles.length, MAX_COLUMNS));
    // Fill the last row so the 1px seam color never shows through empty cells.
    const fillers = tiles.length > cols ? (cols - (tiles.length % cols)) % cols : 0;
    return (
        <div
            data-testid={testId}
            data-columns={cols}
            style={{ "--cols": cols } as CSSProperties}
            className={`grid grid-cols-2 gap-px overflow-hidden rounded-(--radius-md) border border-(--card-stroke) bg-(--card-stroke) [&>*]:rounded-none [&>*]:border-0 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))] ${className}`.trim()}
        >
            {tiles}
            {Array.from({ length: fillers }, (_, i) => (
                <div
                    key={`fill-${i}`}
                    aria-hidden="true"
                    data-testid="metric-strip-filler"
                    className="bg-card"
                />
            ))}
        </div>
    );
}
