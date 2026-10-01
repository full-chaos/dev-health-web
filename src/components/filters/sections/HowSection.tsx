type HowSectionProps = {
    blocked: boolean;
    flowStage: string[];
    toList: (value: string) => string[];
    toValue: (value?: string[]) => string;
    updateBlocked: (nextValue: boolean) => void;
    updateFlowStage: (nextValues: string[]) => void;
    /** Default true. False where no reader uses the filter (see `filterBarConfig`). */
    showFlowStage?: boolean;
    showBlocked?: boolean;
};

export function HowSection({
    blocked,
    flowStage,
    toList,
    toValue,
    updateBlocked,
    updateFlowStage,
    showFlowStage = true,
    showBlocked = true,
}: HowSectionProps) {
    return (
        <details className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
            <summary className="cursor-pointer text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                How
            </summary>
            <div className="mt-3 space-y-3 text-sm">
                {showFlowStage && (
                    <label className="flex flex-col gap-2">
                        <span className="text-xs text-(--ink-muted)">Flow stage</span>
                        <input
                            className="rounded-xl border border-(--card-stroke) bg-card px-3 py-2"
                            placeholder="review, build"
                            value={toValue(flowStage)}
                            onChange={(event) => updateFlowStage(toList(event.target.value))}
                        />
                    </label>
                )}
                {showBlocked && (
                    <label className="flex items-center gap-2 text-xs text-(--ink-muted)">
                        <input
                            type="checkbox"
                            checked={blocked}
                            onChange={(event) => updateBlocked(event.target.checked)}
                        />
                        Blocked only
                    </label>
                )}
            </div>
        </details>
    );
}
