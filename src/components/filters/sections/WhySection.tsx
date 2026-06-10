type WhySectionProps = {
    issueType: string[];
    toList: (value: string) => string[];
    toValue: (value?: string[]) => string;
    updateIssueType: (nextValues: string[]) => void;
    updateWorkCategory: (nextValues: string[]) => void;
    workCategory: string[];
};

export function WhySection({
    issueType,
    toList,
    toValue,
    updateIssueType,
    updateWorkCategory,
    workCategory,
}: WhySectionProps) {
    return (
        <details className="rounded-2xl border border-(--border) bg-(--card-70) p-4">
            <summary className="cursor-pointer text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                Why
            </summary>
            <div className="mt-3 space-y-3 text-sm">
                <label className="flex flex-col gap-2">
                    <span className="text-xs text-(--ink-muted)">Work category</span>
                    <input
                        className="rounded-xl border border-(--border) bg-card px-3 py-2"
                        placeholder="feature, maintenance"
                        value={toValue(workCategory)}
                        onChange={(event) => updateWorkCategory(toList(event.target.value))}
                    />
                </label>
                <label className="flex flex-col gap-2">
                    <span className="text-xs text-(--ink-muted)">Issue type</span>
                    <input
                        className="rounded-xl border border-(--border) bg-card px-3 py-2"
                        placeholder="bug, story"
                        value={toValue(issueType)}
                        onChange={(event) => updateIssueType(toList(event.target.value))}
                    />
                </label>
            </div>
        </details>
    );
}
