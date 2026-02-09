import React, { useState } from "react";
import Link from "next/link";
import { Identity } from "./IdentityTable";
import { Team } from "../teams/TeamTable";

type ProviderEntry = { provider: string; username: string };

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
    usernames.map((username) => ({ provider, username }))
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
  const [formData, setFormData] = useState({
    canonical_id: initialData?.canonical_id ?? "",
    display_name: initialData?.display_name ?? "",
    email: initialData?.email ?? "",
    team_ids: initialData?.team_ids ?? [],
  });
  
  const [providerEntries, setProviderEntries] = useState<ProviderEntry[]>(
    initialData ? recordToArray(initialData.provider_identities) : []
  );

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    if (name === "team_ids") {
      setFormData((prev) => ({ ...prev, team_ids: value ? [value] : [] }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleProviderChange = (
    index: number,
    field: "provider" | "username",
    value: string
  ) => {
    const newProviders = [...providerEntries];
    newProviders[index] = { ...newProviders[index], [field]: value };
    setProviderEntries(newProviders);
  };

  const addProvider = () => {
    setProviderEntries((prev) => [...prev, { provider: "github", username: "" }]);
  };

  const removeProvider = (index: number) => {
    setProviderEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      provider_identities: arrayToRecord(providerEntries),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div className="space-y-4 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6">
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
            className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent) disabled:opacity-50"
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
            className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
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
            className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
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
            onChange={handleChange}
            className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
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
            <label className="block text-sm font-medium">Provider Identities</label>
            <button
              type="button"
              onClick={addProvider}
              className="text-xs font-medium text-(--accent) hover:underline"
            >
              + Add Identity
            </button>
          </div>
          <div className="space-y-3">
            {providerEntries.map((pid, index) => (
              <div key={index} className="flex gap-3">
                <select
                  value={pid.provider}
                  onChange={(e) =>
                    handleProviderChange(index, "provider", e.target.value)
                  }
                  className="w-1/3 rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={pid.username}
                  onChange={(e) =>
                    handleProviderChange(index, "username", e.target.value)
                  }
                  placeholder="Username / ID"
                  className="flex-1 rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                />
                <button
                  type="button"
                  onClick={() => removeProvider(index)}
                  className="text-red-500 hover:text-red-600"
                  aria-label="Remove identity"
                >
                  ✕
                </button>
              </div>
            ))}
            {providerEntries.length === 0 && (
              <p className="text-sm text-(--ink-muted) italic">
                No provider identities linked.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Link
          href="/admin/identities"
          className="rounded-lg px-4 py-2 text-sm font-medium text-(--ink-muted) hover:text-foreground"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90 disabled:opacity-50"
        >
          {isLoading ? "Saving…" : isEditing ? "Update Identity" : "Create Identity"}
        </button>
      </div>
    </form>
  );
}
