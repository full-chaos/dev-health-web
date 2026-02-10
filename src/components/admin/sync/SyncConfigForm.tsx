"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SyncConfig, IntegrationCredential, Provider, PROVIDERS, PROVIDER_LABELS, PROVIDER_SYNC_TARGETS } from "@/lib/admin/types";
import { createSyncConfig, updateSyncConfig } from "@/lib/admin/server";

type SyncConfigFormProps = {
  initialData?: SyncConfig;
  credentials: IntegrationCredential[];
  onSuccess?: () => void;
};

const ALL_SYNC_TARGETS = [
  { id: "git", label: "Git Data (Commits, Branches)" },
  { id: "prs", label: "Pull Requests" },
  { id: "cicd", label: "CI/CD Pipelines" },
  { id: "deployments", label: "Deployments" },
  { id: "incidents", label: "Incidents" },
  { id: "work-items", label: "Work Items (Issues, Tickets)" },
];

function getSyncTargetsForProvider(provider: string) {
  const allowed = PROVIDER_SYNC_TARGETS[provider as Provider] ?? Object.values(PROVIDER_SYNC_TARGETS).flat();
  return ALL_SYNC_TARGETS.filter((t) => allowed.includes(t.id));
}

export function SyncConfigForm({ initialData, credentials, onSuccess }: SyncConfigFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    provider: initialData?.provider || "github",
    credential_id: initialData?.credential_id || "",
    sync_targets: initialData?.sync_targets || [],
    is_active: initialData?.is_active ?? true,
  });

  const filteredCredentials = credentials.filter((c) => c.provider === formData.provider);

  const availableTargets = getSyncTargetsForProvider(formData.provider);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    
    if (type === "checkbox" && name === "is_active") {
      setFormData((prev) => ({ ...prev, is_active: (e.target as HTMLInputElement).checked }));
    } else if (name === "provider") {
      const newAllowed = PROVIDER_SYNC_TARGETS[value as Provider] ?? [];
      setFormData((prev) => ({
        ...prev,
        provider: value,
        sync_targets: prev.sync_targets.filter((t) => newAllowed.includes(t)),
        credential_id: "",
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleTargetChange = (targetId: string, checked: boolean) => {
    setFormData((prev) => {
      const newTargets = checked
        ? [...prev.sync_targets, targetId]
        : prev.sync_targets.filter((t) => t !== targetId);
      return { ...prev, sync_targets: newTargets };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    startTransition(async () => {
      try {
        let result: { error?: string } | undefined;
        if (initialData) {
          result = await updateSyncConfig(initialData.id, {
            sync_targets: formData.sync_targets,
            is_active: formData.is_active,
          });
        } else {
          result = await createSyncConfig({
            name: formData.name,
            provider: formData.provider,
            credential_id: formData.credential_id || null,
            sync_targets: formData.sync_targets,
          });
        }

        if (result?.error) {
          toast.error(result.error);
        } else {
          toast.success(initialData ? "Config updated" : "Config created");
          if (onSuccess) {
            onSuccess();
          } else {
            router.push("/admin/sync");
          }
        }
      } catch {
        toast.error("An unexpected error occurred");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div className="space-y-6 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6">
        
        {/* Name */}
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
            Configuration Name
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            disabled={!!initialData} // Name often immutable or just disabled for simplicity in edit
            required
            className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent) disabled:opacity-50"
            placeholder="e.g., GitHub Main Org Sync"
          />
        </div>

        {/* Provider */}
        <div>
          <label htmlFor="provider" className="mb-1.5 block text-sm font-medium">
            Provider
          </label>
          <select
            id="provider"
            name="provider"
            value={formData.provider}
            onChange={handleChange}
            disabled={!!initialData}
            className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent) disabled:opacity-50"
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABELS[p]}
              </option>
            ))}
          </select>
        </div>

        {/* Credential */}
        <div>
          <label htmlFor="credential_id" className="mb-1.5 block text-sm font-medium">
            Credential
          </label>
          <select
            id="credential_id"
            name="credential_id"
            value={formData.credential_id}
            onChange={handleChange}
            disabled={!!initialData} // Changing credential might require re-auth flow, keep simple for now
            className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent) disabled:opacity-50"
          >
            <option value="">Select a credential...</option>
            {filteredCredentials.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {filteredCredentials.length === 0 && !initialData && (
            <p className="mt-1 text-xs text-amber-500">
              No credentials found for this provider. <Link href="/admin/integrations" className="underline">Add one first</Link>.
            </p>
          )}
        </div>

        {/* Sync Targets */}
        <div>
          <span className="mb-2 block text-sm font-medium">Sync Targets</span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {availableTargets.map((target) => (
              <label
                key={target.id}
                className="flex items-center gap-2 rounded-lg border border-(--card-stroke) bg-(--card-70) p-3 hover:bg-(--card-60)"
              >
                <input
                  type="checkbox"
                  checked={formData.sync_targets.includes(target.id)}
                  onChange={(e) => handleTargetChange(target.id, e.target.checked)}
                  className="h-4 w-4 rounded border-(--card-stroke) bg-(--card-80) text-(--accent) focus:ring-(--accent)"
                />
                <span className="text-sm">{target.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Active Toggle */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="is_active"
            name="is_active"
            checked={formData.is_active}
            onChange={handleChange}
            className="h-4 w-4 rounded border-(--card-stroke) bg-(--card-80) text-(--accent) focus:ring-(--accent)"
          />
          <label htmlFor="is_active" className="text-sm font-medium">
            Enable automatic sync schedule
          </label>
        </div>

      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/sync"
          className="rounded-lg px-4 py-2 text-sm font-medium text-(--ink-muted) hover:text-foreground"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90 disabled:opacity-50"
        >
          {isPending ? "Saving..." : initialData ? "Update Configuration" : "Create Configuration"}
        </button>
      </div>
    </form>
  );
}
