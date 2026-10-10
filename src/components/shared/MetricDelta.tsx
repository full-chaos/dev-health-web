import { formatDelta, formatMetricParts, formatNumber } from "@/lib/formatters";
import type { MetricPolarity } from "@/lib/metrics/catalog";

type MetricDeltaFormat = "percent" | "number";

type MetricDeltaProps = {
    value: number | null | undefined;
    /**
     * State 3 only (the percent is null and the prior is a measured 0): the current value and unit.
     * With them a null `value` reads "+12 from 0", not "No prior period".
     */
    changedFromZero?: { current: number; unit?: string | null };
    format?: MetricDeltaFormat;
    unavailableLabel?: string;
    /** The metric's direction. Absent (and no `inverseGood`): the change is drawn neutral. */
    polarity?: MetricPolarity;
    /** A bare direction: `true` is lower-is-better, `false` is higher-is-better. `polarity` wins. */
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

export type DeltaDirection = { polarity?: MetricPolarity; inverseGood?: boolean };

/**
 * The one tone rule. A tone is a judgement, so it needs a known direction: `polarity` (from the
 * metric catalog) or a bare `inverseGood`. With neither, the change is neutral, never good or bad
 * by its sign. A change that rounds to 0 is muted for every direction.
 */
const toneFor = (rounded: number, { polarity, inverseGood }: DeltaDirection) => {
    const lowerIsBetter =
        polarity !== undefined
            ? polarity === "lowerIsBetter"
            : inverseGood === undefined
              ? undefined
              : inverseGood;
    if (rounded === 0 || lowerIsBetter === undefined) {
        return MUTED_TONE;
    }
    if (rounded > 0) {
        return lowerIsBetter ? NEGATIVE_TONE : POSITIVE_TONE;
    }
    return lowerIsBetter ? POSITIVE_TONE : NEGATIVE_TONE;
};

export type MetricDeltaParts = {
    /** Signed text, for example "+5%" or "-3". */
    label: string;
    /** Direction glyph: up, down, or a dot for no change. */
    glyph: string;
    /** Tone class of the polarity: positive, negative or muted (no change). */
    toneClass: string;
    /**
     * `good` / `bad` after the direction; `flat` when the change rounds to 0 at the precision:
     * too small to call better or worse, so muted (its value is still shown).
     */
    polarity: "good" | "bad" | "flat";
};

/**
 * The sign, text and polarity of a delta, as `MetricDelta` shows them. One rule for every
 * surface that prints a delta (the metric tile reads it for its meta line and its trend dot).
 * Returns null when there is no delta: a missing delta is never a 0.
 */
export function metricDeltaParts(
    value: number | null | undefined,
    options: DeltaDirection & { format?: MetricDeltaFormat; precision?: number } = {},
): MetricDeltaParts | null {
    const { format = "percent", precision = 0 } = options;
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return null;
    }
    const safePrecision = clampPrecision(precision);
    const rounded = roundToPrecision(value, safePrecision);
    const toneClass = toneFor(rounded, options);
    return {
        label:
            format === "percent"
                ? formatSignedPercentDelta(value, rounded, safePrecision)
                : formatSignedNumberDelta(rounded, safePrecision),
        // The glyph follows the served sign, so a small change that is shown (+0.3%) is not a dot.
        glyph: value > 0 ? "↑" : value < 0 ? "↓" : "·",
        toneClass,
        polarity:
            toneClass === POSITIVE_TONE ? "good" : toneClass === NEGATIVE_TONE ? "bad" : "flat",
    };
}

/** The facts that tell the three states of a served delta percent apart. */
export type DeltaFacts = {
    delta_pct?: number | null;
    value?: number | null;
    has_data?: boolean;
    has_prior_data?: boolean;
};

/**
 * State 3 of a served delta percent: "changed from zero". The percent is null, both windows hold
 * data (a flag that is absent counts as data), and the current value is a real, non-zero number:
 * the prior is a measured 0, so a percent is undefined but the change is real. A null percent
 * with `has_prior_data` false stays "no prior period" (state 2).
 */
export function isChangedFromZero(facts: DeltaFacts | null | undefined): boolean {
    if (!facts || facts.delta_pct !== null) return false;
    if (facts.has_data === false || facts.has_prior_data === false) return false;
    return typeof facts.value === "number" && Number.isFinite(facts.value) && facts.value !== 0;
}

/**
 * The text of state 3: the absolute change with "from 0", no percent sign ("+12 from 0",
 * "+5 LOC from 0"). The prior is 0, so the change is the current value; it is formatted by the
 * surface's own metric formatter and unit. A unit of "%" is percentage points: "+5 pts from 0".
 */
export function changedFromZeroLabel(value: number, unit: string | null | undefined): string {
    const sign = value > 0 ? "+" : value < 0 ? "-" : "";
    const magnitude = Math.abs(value);
    if (unit === "%") {
        return `${sign}${formatMetricParts(magnitude, "").value} pts from 0`;
    }
    const parts = formatMetricParts(magnitude, unit ?? "");
    return `${sign}${[parts.value, parts.unit].filter(Boolean).join(" ")} from 0`;
}

/**
 * The parts of state 3, in the shape `metricDeltaParts` returns: the glyph and tone come from the
 * sign of the change (prior 0, so the sign of the current value) and the metric's polarity.
 * Null when the current value is missing or 0: no absolute change can be shown.
 */
export function changedFromZeroParts(
    value: number | null | undefined,
    unit: string | null | undefined,
    options: DeltaDirection = {},
): MetricDeltaParts | null {
    if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return null;
    const toneClass = toneFor(value, options);
    return {
        label: changedFromZeroLabel(value, unit),
        glyph: value > 0 ? "↑" : "↓",
        toneClass,
        polarity:
            toneClass === POSITIVE_TONE ? "good" : toneClass === NEGATIVE_TONE ? "bad" : "flat",
    };
}

/**
 * What a delta tile gets as its `delta`: the served percent as is, except that a null percent
 * with no data or no prior data is "no prior period" (undefined), never state 3.
 */
export function tileDelta(facts: DeltaFacts | null | undefined): number | null | undefined {
    if (!facts) return undefined;
    if (facts.delta_pct === null) {
        return facts.has_data === false || facts.has_prior_data === false ? undefined : null;
    }
    return facts.delta_pct;
}

export function MetricDelta({
    value,
    changedFromZero,
    format = "percent",
    unavailableLabel = "No prior period",
    polarity,
    inverseGood,
    precision = 0,
    className,
    leadingDot = true,
}: MetricDeltaProps) {
    const parts =
        value === null && changedFromZero
            ? changedFromZeroParts(changedFromZero.current, changedFromZero.unit, {
                  polarity,
                  inverseGood,
              })
            : metricDeltaParts(value, { format, polarity, inverseGood, precision });

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
            title={value === 0 ? "No change" : undefined}
            className={`${BASE} ${parts.toneClass} ${className ?? ""}`.trim()}
        >
            {parts.glyph} {parts.label}
        </span>
    );
}
