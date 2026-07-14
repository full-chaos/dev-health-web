import { useState } from "react";

type WhoSectionProps = {
    developers: string[];
    roles: string[];
    toDeveloperList: (value: string) => string[];
    toList: (value: string) => string[];
    toValue: (value?: string[]) => string;
    updateDevelopers: (nextValues: string[]) => void;
    updateRoles: (nextValues: string[]) => void;
};

export function WhoSection({
    developers,
    roles,
    toDeveloperList,
    toList,
    toValue,
    updateDevelopers,
    updateRoles,
}: WhoSectionProps) {
    const [developerDraft, setDeveloperDraft] = useState("");
    const [developerEditing, setDeveloperEditing] = useState(false);
    const developerValue = developerEditing ? developerDraft : toValue(developers);

    return (
        <details className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
            <summary className="cursor-pointer text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                Who
            </summary>
            <div className="mt-3 space-y-3 text-sm">
                <label className="flex flex-col gap-2">
                    <span className="text-xs text-(--ink-muted)">Developers</span>
                    <input
                        className="rounded-xl border border-(--card-stroke) bg-(--card-60) px-3 py-2"
                        placeholder="alice@example.com, bob@example.com"
                        value={developerValue}
                        onFocus={() => {
                            setDeveloperDraft(toValue(developers));
                            setDeveloperEditing(true);
                        }}
                        onChange={(event) => {
                            const nextDraft = event.target.value;
                            setDeveloperDraft(nextDraft);
                            updateDevelopers(toDeveloperList(nextDraft));
                        }}
                        onBlur={() => {
                            setDeveloperDraft(toValue(toDeveloperList(developerDraft)));
                            setDeveloperEditing(false);
                        }}
                    />
                </label>
                <label className="flex flex-col gap-2">
                    <span className="text-xs text-(--ink-muted)">Roles</span>
                    <input
                        className="rounded-xl border border-(--card-stroke) bg-(--card-60) px-3 py-2"
                        placeholder="maintainer, reviewer"
                        value={toValue(roles)}
                        onChange={(event) => updateRoles(toList(event.target.value))}
                    />
                </label>
            </div>
        </details>
    );
}
