type WhoSectionProps = {
    developers: string[];
    roles: string[];
    toList: (value: string) => string[];
    toValue: (value?: string[]) => string;
    updateDevelopers: (nextValues: string[]) => void;
    updateRoles: (nextValues: string[]) => void;
};

export function WhoSection({
    developers,
    roles,
    toList,
    toValue,
    updateDevelopers,
    updateRoles,
}: WhoSectionProps) {
    return (
        <details className="rounded-2xl border border-(--border) bg-(--card-70) p-4">
            <summary className="cursor-pointer text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                Who
            </summary>
            <div className="mt-3 space-y-3 text-sm">
                <label className="flex flex-col gap-2">
                    <span className="text-xs text-(--ink-muted)">Developers</span>
                    <input
                        className="rounded-xl border border-(--border) bg-(--card-60) px-3 py-2"
                        placeholder="alice, bob"
                        value={toValue(developers)}
                        onChange={(event) => updateDevelopers(toList(event.target.value))}
                    />
                </label>
                <label className="flex flex-col gap-2">
                    <span className="text-xs text-(--ink-muted)">Roles</span>
                    <input
                        className="rounded-xl border border-(--border) bg-(--card-60) px-3 py-2"
                        placeholder="maintainer, reviewer"
                        value={toValue(roles)}
                        onChange={(event) => updateRoles(toList(event.target.value))}
                    />
                </label>
            </div>
        </details>
    );
}
