type WhatSectionProps = {
    repos: string[];
    toList: (value: string) => string[];
    toValue: (value?: string[]) => string;
    updateRepos: (nextValues: string[]) => void;
};

export function WhatSection({ repos, toList, toValue, updateRepos }: WhatSectionProps) {
    return (
        <details className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
            <summary className="cursor-pointer text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                What
            </summary>
            <div className="mt-3 space-y-3 text-sm">
                <label className="flex flex-col gap-2">
                    <span className="text-xs text-(--ink-muted)">Repos</span>
                    <input
                        className="rounded-xl border border-(--card-stroke) bg-card px-3 py-2"
                        placeholder="org/api, org/ui"
                        value={toValue(repos)}
                        onChange={(event) => updateRepos(toList(event.target.value))}
                    />
                </label>
            </div>
        </details>
    );
}
