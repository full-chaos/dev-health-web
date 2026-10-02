import { Children, isValidElement, type CSSProperties, type ReactNode } from "react";

/**
 * One row of metric tiles with one column per tile (prototype `metrics(arr, cols)`):
 * 5 tiles give 5 columns, 4 give 4, 3 give 3. Under the `lg` breakpoint it falls
 * back to two columns so tiles stay readable.
 *
 * Layout only. Tiles keep their own look and data logic (`MetricCard`).
 * `columns` overrides the count when the caller needs a fixed grid.
 */
export type MetricStripProps = {
    children: ReactNode;
    /** Override the column count. Default: the number of rendered tiles. */
    columns?: number;
    className?: string;
    "data-testid"?: string;
};

export function MetricStrip({
    children,
    columns,
    className = "",
    "data-testid": testId,
}: MetricStripProps) {
    const tiles = Children.toArray(children).filter(isValidElement);
    const cols = Math.max(1, columns ?? tiles.length);
    return (
        <div
            data-testid={testId}
            data-columns={cols}
            style={{ "--cols": cols } as CSSProperties}
            className={`grid grid-cols-2 gap-4 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))] ${className}`.trim()}
        >
            {tiles}
        </div>
    );
}
