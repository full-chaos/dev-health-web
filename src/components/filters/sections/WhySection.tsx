type WhySectionProps = {
    toList: (value: string) => string[];
    toValue: (value?: string[]) => string;
    updateWorkCategory: (nextValues: string[]) => void;
    workCategory: string[];
    /** Default true. False where no reader uses the work category. */
    showWorkCategory?: boolean;
};

export function WhySection({
    toList,
    toValue,
    updateWorkCategory,
    workCategory,
    showWorkCategory = true,
}: WhySectionProps) {
    return (
        <details className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
            <summary className="cursor-pointer text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                Why
            </summary>
            <div className="mt-3 space-y-3 text-sm">
                {showWorkCategory && (
                    <label className="flex flex-col gap-2">
                        <span className="text-xs text-(--ink-muted)">Work category</span>
                        <input
                            className="rounded-xl border border-(--card-stroke) bg-card px-3 py-2"
                            placeholder="feature, maintenance"
                            value={toValue(workCategory)}
                            onChange={(event) => updateWorkCategory(toList(event.target.value))}
                        />
                    </label>
                )}
            </div>
        </details>
    );
}
