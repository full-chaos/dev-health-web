import { useState, type SyntheticEvent } from "react";
import Link from "next/link";
import { Identity } from "./IdentityTable";
import { Team } from "../teams/TeamTable";
import { BaseForm, inputClass, useBaseFormState } from "@/components/shared/BaseForm";
import { ProviderIdentitySection } from "./ProviderIdentitySection";
import {
    arrayToRecord,
    recordToArray,
    validateProviderEntries,
    type ProviderEntry,
} from "./providerIdentityUtils";
import { CTA_LABELS } from "@/lib/design/cta";

type IdentityFormProps = {
    initialData?: Identity;
    teams: Team[];
    onSubmit: (data: Identity) => void;
    isEditing?: boolean;
    isLoading?: boolean;
};

export function IdentityForm({
    initialData,
    teams,
    onSubmit,
    isEditing = false,
    isLoading = false,
}: IdentityFormProps) {
    const { formData, setFormData, handleChange } = useBaseFormState({
        canonical_id: initialData?.canonical_id ?? "",
        display_name: initialData?.display_name ?? "",
        email: initialData?.email ?? "",
        team_ids: initialData?.team_ids ?? [],
    });

    const [providerEntries, setProviderEntries] = useState<ProviderEntry[]>(
        initialData ? recordToArray(initialData.provider_identities) : [],
    );
    const [providerError, setProviderError] = useState<string | null>(null);

    const handleTeamToggle = (teamId: string, checked: boolean) => {
        setFormData((prev) => ({
            ...prev,
            team_ids: checked
                ? [...prev.team_ids, teamId]
                : prev.team_ids.filter((id) => id !== teamId),
        }));
    };

    const handleProviderChange = (index: number, field: "provider" | "username", value: string) => {
        setProviderEntries((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
        setProviderError(null);
    };

    const addProvider = () => {
        setProviderEntries((prev) => [
            ...prev,
            {
                id: `provider-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                provider: "github",
                username: "",
            },
        ]);
    };

    const removeProvider = (index: number) => {
        setProviderEntries((prev) => prev.filter((_, idx) => idx !== index));
        setProviderError(null);
    };

    const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
        event.preventDefault();

        const validation = validateProviderEntries(providerEntries);
        if (!validation.ok) {
            setProviderError(validation.message);
            return;
        }
        setProviderError(null);

        onSubmit({
            ...formData,
            provider_identities: arrayToRecord(providerEntries),
        });
    };

    return (
        <BaseForm
            onSubmitAction={handleSubmit}
            isLoading={isLoading}
            submitLabel={
                isLoading ? "Saving..." : isEditing ? "Update Identity" : "Create Identity"
            }
            className="max-w-2xl space-y-6"
            contentClassName="space-y-4 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6"
            actionsClassName="flex items-center gap-4"
            actionsStart={
                <Link
                    href="/org/admin/identities"
                    className="rounded-lg px-4 py-2 text-sm font-medium text-(--ink-muted) hover:text-foreground"
                >
                    {CTA_LABELS.cancel}
                </Link>
            }
        >
            <div>
                <label htmlFor="canonical_id" className="mb-1.5 block text-sm font-medium">
                    Canonical ID
                </label>
                <input
                    type="text"
                    id="canonical_id"
                    name="canonical_id"
                    value={formData.canonical_id}
                    onChange={handleChange}
                    disabled={isEditing}
                    required
                    className={`${inputClass} text-sm disabled:opacity-50`}
                    placeholder="e.g., alice-smith"
                />
                <p className="mt-1 text-xs text-(--ink-muted)">
                    Unique identifier for the identity. Cannot be changed after creation.
                </p>
            </div>

            <div>
                <label htmlFor="display_name" className="mb-1.5 block text-sm font-medium">
                    Display Name
                </label>
                <input
                    type="text"
                    id="display_name"
                    name="display_name"
                    value={formData.display_name ?? ""}
                    onChange={handleChange}
                    className={`${inputClass} text-sm`}
                    placeholder="e.g., Alice Smith"
                />
            </div>

            <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
                    Email
                </label>
                <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email ?? ""}
                    onChange={handleChange}
                    className={`${inputClass} text-sm`}
                    placeholder="e.g., alice@example.com"
                />
            </div>

            <fieldset>
                <legend className="mb-1.5 block text-sm font-medium">Teams</legend>
                {teams.length === 0 ? (
                    <p className="text-sm italic text-(--ink-muted)">No teams available yet.</p>
                ) : (
                    <div className="space-y-2">
                        {teams.map((team) => {
                            const checked = formData.team_ids.includes(team.team_id);
                            return (
                                <label
                                    key={team.team_id}
                                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-(--card-stroke) bg-(--card-70) p-2.5 hover:bg-(--card-60)"
                                >
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(event) =>
                                            handleTeamToggle(team.team_id, event.target.checked)
                                        }
                                        className="h-4 w-4 rounded border-(--card-stroke) bg-(--card-80) text-(--accent) focus:ring-(--accent)"
                                    />
                                    <span className="text-sm">{team.name}</span>
                                </label>
                            );
                        })}
                    </div>
                )}
                <p className="mt-1 text-xs text-(--ink-muted)">
                    Select every team this identity belongs to.
                </p>
            </fieldset>

            <ProviderIdentitySection
                entries={providerEntries}
                error={providerError}
                onEntryChangeAction={handleProviderChange}
                onAddAction={addProvider}
                onRemoveAction={removeProvider}
            />
        </BaseForm>
    );
}
