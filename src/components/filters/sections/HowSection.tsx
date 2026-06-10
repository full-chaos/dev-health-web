type HowSectionProps = {
    blocked: boolean;
    flowStage: string[];
    toList: (value: string) => string[];
    toValue: (value?: string[]) => string;
    updateBlocked: (nextValue: boolean) => void;
    updateFlowStage: (nextValues: string[]) => void;
};

export function HowSection({
    blocked,
    flowStage,
    toList,
    toValue,
    updateBlocked,
    updateFlowStage,
}: HowSectionProps) {
    return (
        <details className="rounded-2xl border border-(--border) bg-(--card-70) p-4">
            <summary className="cursor-pointer text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                How
            </summary>
            <div className="mt-3 space-y-3 text-sm">
                <label className="flex flex-col gap-2">
                    <span className="text-xs text-(--ink-muted)">Flow stage</span>
                    <input
                        className="rounded-xl border border-(--border) bg-card px-3 py-2"
                        placeholder="review, build"
                        value={toValue(flowStage)}
                        onChange={(event) => updateFlowStage(toList(event.target.value))}
                    />
                </label>
                <label className="flex items-center gap-2 text-xs text-(--ink-muted)">
                    <input
                        type="checkbox"
                        checked={blocked}
                        onChange={(event) => updateBlocked(event.target.checked)}
                    />
                    Blocked only
                </label>
            </div>
        </details>
    );
}
