import { formatNumber } from "@/lib/formatters";

/** Shown in place of a value the API did not serve. */
export const METER_NOT_REPORTED = "Not reported";

export type MeterRow = {
    /** Stable key. Default: the label. */
    key?: string;
    label: string;
    /** The served value that sets the fill. `null` = not served: "Not reported" and an empty track. */
    value: number | null;
    /**
     * The value as shown, already formatted from served data (for example a signed "+84.6%").
     * Default: the number, with `unit` after it.
     */
    display?: string;
    /** Fill colour, a CSS colour such as a theme token. Default: the first data colour. */
    color?: string;
    /** Full text for a shortened label (shown as a tooltip). */
    title?: string;
    /** Makes the label a button, for example to drill into the row. */
    onSelect?: () => void;
    /** Marks the selected row (with `onSelect`). */
    selected?: boolean;
};

type MeterRowsProps = {
    rows: MeterRow[];
    /** The value of a full track. Default: the largest value of the rows. */
    max?: number;
    /** Unit after each value, unless the shown value already ends with it. */
    unit?: string;
    /**
     * Signed rows (changes: "+84.6%", "-20%"): the track has a zero line in the middle, a positive
     * value fills to the right, a negative one to the left, one hue. The fill is |value| / max x
     * half the track. Default: unsigned (the fill starts at the left, 0 or below is an empty track).
     */
    signed?: boolean;
    "aria-label"?: string;
    testId?: string;
};

const DEFAULT_FILL = "var(--chart-color-1)";

function shown(row: MeterRow, unit: string | undefined): string {
    if (row.value === null) return METER_NOT_REPORTED;
    const text = row.display ?? formatNumber(row.value, { maximumFractionDigits: 1 });
    const suffix = unit?.trim();
    return suffix && !text.endsWith(suffix) ? `${text}${unit}` : text;
}

/**
 * Meter rows (prototype `bars()`, `charts-a.js:56`; `.fc-bars`, `theme.css:107`): per row the
 * label, a track whose fill is value / max, and the value with its unit at the right. No axis.
 * A value of 0 or below draws an empty track; a value the API did not serve shows "Not reported".
 * Presentational: it draws the served values and computes only the fill width.
 */
export function MeterRows({
    rows,
    max,
    unit,
    signed = false,
    "aria-label": ariaLabel,
    testId,
}: MeterRowsProps) {
    const largest = Math.max(
        0,
        ...rows.map((row) => (signed ? Math.abs(row.value ?? 0) : (row.value ?? 0))),
    );
    const full = max && max > 0 ? max : largest || 1;

    return (
        <ul
            data-testid={testId ?? "meter-rows"}
            aria-label={ariaLabel}
            className="grid grid-cols-[minmax(6rem,auto)_minmax(5rem,1fr)_auto] items-center gap-x-3.5 gap-y-2.75 text-xs"
        >
            {rows.map((row) => {
                const reported = row.value !== null;
                // Unsigned: the share of the full track. Signed: the share of HALF the track (the
                // zero line is in the middle), on the side of the sign.
                const magnitude = row.value === null ? 0 : signed ? Math.abs(row.value) : row.value;
                const pct = magnitude > 0 ? Math.min(100, (magnitude / full) * 100) : 0;
                const negative = signed && row.value !== null && row.value < 0;
                return (
                    <li
                        key={row.key ?? row.label}
                        data-testid="meter-row"
                        data-reported={reported}
                        className="col-span-3 grid grid-cols-subgrid items-center"
                    >
                        {row.onSelect ? (
                            <button
                                type="button"
                                onClick={row.onSelect}
                                title={row.title}
                                aria-pressed={row.selected ?? undefined}
                                className={`min-w-0 text-left wrap-anywhere text-foreground hover:underline ${
                                    row.selected ? "font-semibold" : ""
                                }`}
                            >
                                {row.label}
                            </button>
                        ) : (
                            <span
                                title={row.title}
                                className="min-w-0 wrap-anywhere text-foreground"
                            >
                                {row.label}
                            </span>
                        )}
                        <span
                            aria-hidden="true"
                            data-testid="meter-track"
                            className="relative h-2 rounded-r-sm bg-(--surface2)"
                        >
                            {signed ? (
                                <span
                                    data-testid="meter-zero-line"
                                    className="absolute inset-y-[-3px] left-1/2 w-px bg-(--ink-muted)"
                                />
                            ) : null}
                            {pct > 0 ? (
                                <span
                                    data-testid="meter-fill"
                                    data-direction={
                                        signed ? (negative ? "left" : "right") : undefined
                                    }
                                    className={`absolute inset-y-0 min-w-0.5 ${
                                        signed
                                            ? negative
                                                ? "right-1/2 rounded-l-sm"
                                                : "left-1/2 rounded-r-sm"
                                            : "left-0 rounded-r-sm"
                                    }`}
                                    style={{
                                        width: `${Math.round((signed ? pct / 2 : pct) * 10) / 10}%`,
                                        background: row.color ?? DEFAULT_FILL,
                                    }}
                                />
                            ) : null}
                        </span>
                        <span
                            data-testid="meter-value"
                            className={`text-right tabular-nums ${
                                reported ? "font-semibold text-foreground" : "text-(--ink-muted)"
                            }`}
                        >
                            {shown(row, unit)}
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}
