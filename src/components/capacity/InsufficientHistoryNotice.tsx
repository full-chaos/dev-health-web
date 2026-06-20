import type { ThroughputRollingWindow } from "@/lib/graphql/types";

type InsufficientHistoryNoticeProps = {
    insufficientHistory: boolean;
    rollingWindows: ThroughputRollingWindow[];
};

/**
 * Warning banner shown when the throughput forecast is built on too little
 * history to produce a reliable estimate (CHAOS-2575).
 *
 * The backend now returns an honest no-estimate contract under short history:
 * each rolling window is flagged `insufficientHistory` and emits no samples,
 * and the forecast-level `insufficientHistory` flag is set. This component
 * surfaces that state so the percentile estimates are read as provisional, and
 * breaks down how many weekly samples each 4/8/12-week window actually had.
 *
 * Renders nothing when history is sufficient.
 */
export function InsufficientHistoryNotice({
    insufficientHistory,
    rollingWindows,
}: InsufficientHistoryNoticeProps) {
    if (!insufficientHistory) return null;

    return (
        <section
            role="status"
            aria-live="polite"
            className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-6"
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-amber-200">Limited history</h2>
                <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs uppercase tracking-[0.16em] text-amber-200">
                    Forecast provisional
                </span>
            </div>
            <p className="mt-3 text-sm text-amber-100/80">
                There isn&apos;t enough throughput history to compute reliable 4/8/12-week rolling
                estimates for this scope. The weeks-to-complete figures below may be unavailable or
                provisional — widen the date range, pick a different team, or sync more work-item
                history.
            </p>
            <dl className="mt-4 flex flex-wrap gap-2">
                {rollingWindows.map((window) => (
                    <div
                        key={window.windowWeeks}
                        className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs ${
                            window.insufficientHistory
                                ? "bg-amber-500/15 text-amber-200"
                                : "bg-foreground/10 text-(--ink-muted)"
                        }`}
                    >
                        <dt className="font-semibold">{window.windowWeeks}w</dt>
                        <dd>
                            {window.sampleCount} {window.sampleCount === 1 ? "sample" : "samples"}
                            {window.insufficientHistory ? " · insufficient" : ""}
                        </dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
