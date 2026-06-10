import { useState, type ChangeEvent, type SyntheticEvent } from "react";
import Link from "next/link";
import { Identity } from "./IdentityTable";
import { Team } from "../teams/TeamTable";
import { BaseForm, inputClass, useBaseFormState } from "@/components/shared/BaseForm";

type ProviderEntry = { id: string; provider: string; username: string };

type IdentityFormProps = {
    initialData?: Identity;
    teams: Team[];
    onSubmit: (data: Identity) => void;
    isEditing?: boolean;
    isLoading?: boolean;
};

const PROVIDERS = ["github", "gitlab", "jira", "email"];

function recordToArray(record: Record<string, string[]>): ProviderEntry[] {
    return Object.entries(record).flatMap(([provider, usernames]) =>
        usernames.map((username, index) => ({
            id: `${provider}-${username}-${index}`,
            provider,
            username,
        })),
    );
}

function arrayToRecord(arr: ProviderEntry[]): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    arr.forEach(({ provider, username }) => {
        if (!result[provider]) result[provider] = [];
        if (username) result[provider].push(username);
    });
    return result;
}

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

    const handleFormChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        if (event.target.name === "team_ids") {
            setFormData((prev) => ({
                ...prev,
                team_ids: event.target.value ? [event.target.value] : [],
            }));
            return;
        }
        handleChange(event);
    };

    const handleProviderChange = (index: number, field: "provider" | "username", value: string) => {
        const nextProviders = [...providerEntries];
        nextProviders[index] = { ...nextProviders[index], [field]: value };
        setProviderEntries(nextProviders);
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
    };

    const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
        event.preventDefault();
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
                    href="/admin/identities"
                    className="rounded-lg px-4 py-2 text-sm font-medium text-(--ink-muted) hover:text-foreground"
                >
                    Cancel
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
                    onChange={handleFormChange}
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
                    onChange={handleFormChange}
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
                    onChange={handleFormChange}
                    className={`${inputClass} text-sm`}
                    placeholder="e.g., alice@example.com"
                />
            </div>

            <div>
                <label htmlFor="team_ids" className="mb-1.5 block text-sm font-medium">
                    Team
                </label>
                <select
                    id="team_ids"
                    name="team_ids"
                    value={formData.team_ids[0] ?? ""}
                    onChange={handleFormChange}
                    className={`${inputClass} text-sm`}
                >
                    <option value="">Select a team...</option>
                    {teams.map((team) => (
                        <option key={team.team_id} value={team.team_id}>
                            {team.name}
                        </option>
                    ))}
                </select>
            </div>

            <div>
                <div className="mb-2 flex items-center justify-between">
                    <span className="block text-sm font-medium">Provider Identities</span>
                    <button
                        type="button"
                        onClick={addProvider}
                        className="text-xs font-medium text-(--accent) hover:underline"
                    >
                        + Add Identity
                    </button>
                </div>
                <div className="space-y-3">
                    {providerEntries.map((entry, index) => (
                        <div key={entry.id} className="flex gap-3">
                            <select
                                value={entry.provider}
                                onChange={(event) =>
                                    handleProviderChange(index, "provider", event.target.value)
                                }
                                className="w-1/3 rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                            >
                                {PROVIDERS.map((provider) => (
                                    <option key={provider} value={provider}>
                                        {provider.charAt(0).toUpperCase() + provider.slice(1)}
                                    </option>
                                ))}
                            </select>
                            <input
                                type="text"
                                value={entry.username}
                                onChange={(event) =>
                                    handleProviderChange(index, "username", event.target.value)
                                }
                                placeholder="Username / ID"
                                className={`${inputClass} flex-1 text-sm`}
                            />
                            <button
                                type="button"
                                onClick={() => removeProvider(index)}
                                className="text-red-500 hover:text-red-600"
                                aria-label="Remove identity"
                            >
                                x
                            </button>
                        </div>
                    ))}
                    {providerEntries.length === 0 && (
                        <p className="text-sm italic text-(--ink-muted)">
                            No provider identities linked.
                        </p>
                    )}
                </div>
            </div>
        </BaseForm>
    );
}
