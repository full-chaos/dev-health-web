import type { CapacityForecast } from "@/lib/graphql/types";
import { STATUS_PILL } from "@/lib/statusPill";

export function formatForecastDate(dateStr: string | undefined): string {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function lowVarianceWeeks(days: number): string {
    const weeks = Math.max(1, Math.round(days / 7));
    return `≈${weeks} ${weeks === 1 ? "week" : "weeks"}`;
}

function Tile({
    label,
    value,
    caption,
    pill,
    testId,
}: {
    label: string;
    value: string;
    caption?: string;
    pill?: string;
    testId: string;
}) {
    return (
        <div
            data-testid={testId}
            className="rounded-(--radius-lg) border border-(--border) bg-(--surface) p-6"
        >
            <div className="flex min-h-6 items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.18em] text-(--text-muted)">{label}</p>
                {pill ? (
                    <span
                        className={`rounded-full border px-2 py-0.5 text-xs uppercase tracking-[0.16em] ${STATUS_PILL.muted}`}
                    >
                        {pill}
                    </span>
                ) : null}
            </div>
            <p className="mt-3 text-3xl font-semibold">{value}</p>
            {caption ? <p className="mt-2 text-xs text-(--text-muted)">{caption}</p> : null}
        </div>
    );
}

const daysCaption = (days: number | undefined) =>
    typeof days === "number" ? `${days} ${days === 1 ? "day" : "days"}` : undefined;

/**
 * The forecast as tiles: remaining work and the three percentile dates. The
 * percentiles are neutral text (a later date is not an error); "Target" marks
 * P85. When P50, P85 and P95 are the same, one "Forecast range" tile says so,
 * as the old card did. Values come from the same fields as before.
 */
export function ForecastTiles({ forecast }: { forecast: CapacityForecast }) {
    const lowVariance =
        typeof forecast.p50Days === "number" &&
        forecast.p50Days === forecast.p85Days &&
        forecast.p85Days === forecast.p95Days;

    return (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-testid="forecast-tiles">
            <Tile
                testId="tile-remaining"
                label="Remaining work"
                value={`${forecast.backlogSize} ${forecast.backlogSize === 1 ? "item" : "items"}`}
            />
            {lowVariance ? (
                <Tile
                    testId="tile-range"
                    label="Forecast range"
                    value={lowVarianceWeeks(forecast.p50Days ?? 0)}
                    caption={`low variance · ${formatForecastDate(forecast.p50Date)}`}
                />
            ) : (
                <>
                    <Tile
                        testId="tile-p50"
                        label="P50 · optimistic"
                        value={formatForecastDate(forecast.p50Date)}
                        caption={daysCaption(forecast.p50Days)}
                    />
                    <Tile
                        testId="tile-p85"
                        label="P85 · target"
                        pill="Target"
                        value={formatForecastDate(forecast.p85Date)}
                        caption={daysCaption(forecast.p85Days)}
                    />
                    <Tile
                        testId="tile-p95"
                        label="P95 · conservative"
                        value={formatForecastDate(forecast.p95Date)}
                        caption={daysCaption(forecast.p95Days)}
                    />
                </>
            )}
        </section>
    );
}
