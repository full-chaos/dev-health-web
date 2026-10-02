import { formatDelta, formatNumber } from "@/lib/formatters";

type MetricDeltaFormat = "percent" | "number";

type MetricDeltaProps = {
    value: number | null | undefined;
    format?: MetricDeltaFormat;
    unavailableLabel?: string;
    inverseGood?: boolean;
    precision?: number;
    className?: string;
    /** Unavailable state only: `false` drops the leading "· " (the caller places its own separator). */
    leadingDot?: boolean;
};

const BASE = "inline-flex items-center gap-1 text-[10px] normal-case tracking-normal";
const POSITIVE_TONE = "text-(--positive)";
const NEGATIVE_TONE = "text-(--accent-negative)";
const MUTED_TONE = "text-(--ink-muted)";

const clampPrecision = (precision: number) => Math.max(0, Math.min(6, precision));

const roundToPrecision = (value: number, precision: number) => {
    const factor = 10 ** precision;
    const rounded = Math.round(value * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
};

const formatSignedNumberDelta = (rounded: number, precision: number) => {
    const sign = rounded > 0 ? "+" : rounded < 0 ? "-" : "";
    return `${sign}${formatNumber(Math.abs(rounded), {
        maximumFractionDigits: precision,
    })}`;
};

const formatSignedPercentDelta = (value: number, rounded: number, precision: number) => {
    if (precision === 0) {
        return formatDelta(value);
    }
    return `${formatSignedNumberDelta(rounded, precision)}%`;
};

const toneFor = (rounded: number, inverseGood: boolean) => {
    if (rounded === 0) {
        return MUTED_TONE;
    }
    if (rounded > 0) {
        return inverseGood ? NEGATIVE_TONE : POSITIVE_TONE;
    }
    return inverseGood ? POSITIVE_TONE : NEGATIVE_TONE;
};

export type MetricDeltaParts = {
    /** Signed text, for example "+5%" or "-3". */
    label: string;
    /** Direction glyph: up, down, or a dot for no change. */
    glyph: string;
    /** Tone class of the polarity: positive, negative or muted (no change). */
    toneClass: string;
    /** `good` / `bad` after `inverseGood`; `flat` when the rounded change is 0. */
    polarity: "good" | "bad" | "flat";
};

/**
 * The sign, text and polarity of a delta, as `MetricDelta` shows them. One rule for every
 * surface that prints a delta (the metric tile reads it for its meta line and its trend dot).
 * Returns null when there is no delta: a missing delta is never a 0.
 */
export function metricDeltaParts(
    value: number | null | undefined,
    options: { format?: MetricDeltaFormat; inverseGood?: boolean; precision?: number } = {},
): MetricDeltaParts | null {
    const { format = "percent", inverseGood = false, precision = 0 } = options;
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return null;
    }
    const safePrecision = clampPrecision(precision);
    const rounded = roundToPrecision(value, safePrecision);
    const toneClass = toneFor(rounded, inverseGood);
    return {
        label:
            format === "percent"
                ? formatSignedPercentDelta(value, rounded, safePrecision)
                : formatSignedNumberDelta(rounded, safePrecision),
        glyph: rounded > 0 ? "↑" : rounded < 0 ? "↓" : "·",
        toneClass,
        polarity:
            toneClass === POSITIVE_TONE ? "good" : toneClass === NEGATIVE_TONE ? "bad" : "flat",
    };
}

export function MetricDelta({
    value,
    format = "percent",
    unavailableLabel = "No prior period",
    inverseGood = false,
    precision = 0,
    className,
    leadingDot = true,
}: MetricDeltaProps) {
    const parts = metricDeltaParts(value, { format, inverseGood, precision });

    if (parts === null) {
        return (
            <span
                title="No prior period available to compute a change"
                className={`${BASE} ${MUTED_TONE} ${className ?? ""}`.trim()}
            >
                {leadingDot ? "· " : ""}
                {unavailableLabel}
            </span>
        );
    }

    return (
        <span
            title={parts.polarity === "flat" ? "No change" : undefined}
            className={`${BASE} ${parts.toneClass} ${className ?? ""}`.trim()}
        >
            {parts.glyph} {parts.label}
        </span>
    );
}
