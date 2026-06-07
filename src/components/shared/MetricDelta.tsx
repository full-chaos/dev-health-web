import { formatDelta, formatNumber } from "@/lib/formatters";

type MetricDeltaFormat = "percent" | "number";

type MetricDeltaProps = {
	value: number | null | undefined;
	format?: MetricDeltaFormat;
	unavailableLabel?: string;
	inverseGood?: boolean;
	precision?: number;
	className?: string;
};

const BASE =
	"inline-flex items-center gap-1 text-[10px] normal-case tracking-normal";
const POSITIVE_TONE = "text-(--positive)";
const NEGATIVE_TONE = "text-(--accent-negative)";
const MUTED_TONE = "text-(--ink-muted)";

const clampPrecision = (precision: number) =>
	Math.max(0, Math.min(6, precision));

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

const formatSignedPercentDelta = (
	value: number,
	rounded: number,
	precision: number,
) => {
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

export function MetricDelta({
	value,
	format = "percent",
	unavailableLabel = "No prior period",
	inverseGood = false,
	precision = 0,
	className,
}: MetricDeltaProps) {
	const safePrecision = clampPrecision(precision);
	const isUnavailable =
		value === null || value === undefined || !Number.isFinite(value);

	if (isUnavailable) {
		return (
			<span
				title="No prior period available to compute a change"
				className={`${BASE} ${MUTED_TONE} ${className ?? ""}`.trim()}
			>
				· {unavailableLabel}
			</span>
		);
	}

	const rounded = roundToPrecision(value, safePrecision);
	const glyph = rounded > 0 ? "↑" : rounded < 0 ? "↓" : "·";
	const label =
		format === "percent"
			? formatSignedPercentDelta(value, rounded, safePrecision)
			: formatSignedNumberDelta(rounded, safePrecision);

	return (
		<span
			title={rounded === 0 ? "No change" : undefined}
			className={`${BASE} ${toneFor(rounded, inverseGood)} ${className ?? ""}`.trim()}
		>
			{glyph} {label}
		</span>
	);
}
