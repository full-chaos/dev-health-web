import { formatNumber } from "@/lib/formatters";

/**
 * Meter rows: label, a track with a fill, the value at the right (the approved prototype `bars()`,
 * rendered by `charts-a.js` as `.fc-bars`: a 3-column grid, an 8px track rounded at the right end,
 * the value in tabular figures).
 *
 * LOCAL COPY, to fold into the shared meter rows when they are on main: the props have the shared
 * shape, so callers do not change. Presentational: it draws the served values and computes no
 * number. A row with no served value reads "Not reported" with an empty track; a served 0 draws an
 * empty track and "0" (missing is not zero).
 */
export type MeterRow = {
    label: string;
    /** Served value; `null` = not served. */
    value: number | null;
    /** Text of the value as the page shows it (default: the number with `unit`). */
    display?: string;
};

type MeterRowsProps = {
    rows: MeterRow[];
    /** Value of a full track. Default: the largest served value. */
    max?: number;
    /** Unit after the default value text (for example "%"). */
    unit?: string;
    "data-testid"?: string;
    /** `data-testid` of each row (a `display: contents` group of the three cells). */
    rowTestId?: string;
};

export const NOT_REPORTED = "Not reported";

export function MeterRows({
    rows,
    max,
    unit = "",
    "data-testid": testId,
    rowTestId = "meter-row",
}: MeterRowsProps) {
    const served = rows.flatMap((row) => (row.value === null ? [] : [row.value]));
    const full = max ?? Math.max(0, ...served);
    return (
        <div
            data-testid={testId}
            className="grid grid-cols-[minmax(6rem,auto)_minmax(5rem,1fr)_auto] items-center gap-x-3.5 gap-y-2.75 text-xs"
        >
            {rows.map((row) => {
                const reported = row.value !== null;
                const width =
                    reported && full > 0 && row.value! > 0
                        ? Math.min(100, (row.value! / full) * 100)
                        : 0;
                const text = reported
                    ? (row.display ?? `${formatNumber(row.value!)}${unit}`)
                    : NOT_REPORTED;
                return (
                    <div
                        key={row.label}
                        className="contents"
                        data-testid={rowTestId}
                        data-reported={reported}
                    >
                        <span className="text-foreground [overflow-wrap:anywhere]">
                            {row.label}
                        </span>
                        <span
                            className="relative h-2 rounded-r-(--radius-sm) bg-(--surface2)"
                            aria-hidden="true"
                        >
                            {width > 0 ? (
                                <span
                                    data-testid="meter-fill"
                                    className="absolute inset-y-0 left-0 min-w-0.5 rounded-r-(--radius-sm) bg-(--chart-color-1)"
                                    style={{ width: `${width}%` }}
                                />
                            ) : null}
                        </span>
                        <span
                            className={`text-right tabular-nums ${
                                reported ? "font-semibold text-foreground" : "text-(--ink-muted)"
                            }`}
                        >
                            {text}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
