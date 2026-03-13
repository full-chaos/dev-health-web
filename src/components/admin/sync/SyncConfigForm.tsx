"use client";

import { useEffect, useState, useTransition, type ChangeEvent, type SyntheticEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SyncConfig, IntegrationCredential, Provider, PROVIDERS, PROVIDER_LABELS, PROVIDER_SYNC_TARGETS } from "@/lib/admin/types";
import { createSyncConfig, updateSyncConfig } from "@/lib/admin/server";
import { UpgradeGate } from "@/components/billing/UpgradeGate";
import { useAdminTier } from "@/components/admin/AdminTierContext";
import { BaseForm, inputClass, useBaseFormState } from "@/components/shared/BaseForm";
import { CreateCredentialModal } from "./CreateCredentialModal";
import { SchedulePicker } from "./SchedulePicker";

type SyncConfigFormProps = {
  initialData?: SyncConfig;
  credentials: IntegrationCredential[];
  onSuccessAction?: () => void;
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

export function SyncConfigForm({ initialData, credentials, onSuccessAction }: SyncConfigFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showCredentialModal, setShowCredentialModal] = useState(false);
  const [localCredentials, setLocalCredentials] = useState(credentials);
  const { features } = useAdminTier();

  const { formData, setFormData, handleChange: handleBaseChange } = useBaseFormState({
    name: initialData?.name || "",
    provider: initialData?.provider || "github",
    credential_id: initialData?.credential_id || "",
    sync_targets: initialData?.sync_targets || [],
    is_active: initialData?.is_active ?? true,
    schedule_cron: initialData?.schedule_cron ?? null,
    timezone: initialData?.timezone ?? null,
    initial_sync_depth: (initialData?.initial_sync_depth ?? 30) as number | null,
    owner: (initialData?.sync_options?.owner as string) || "",
    repo: (initialData?.sync_options?.repo as string) || "",
    gitlab_url: (initialData?.sync_options?.gitlab_url as string) || "",
  });

  useEffect(() => {
    setLocalCredentials(credentials);
  }, [credentials]);

  const filteredCredentials = localCredentials.filter((c) => c.provider === formData.provider);

  const availableTargets = getSyncTargetsForProvider(formData.provider);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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
        owner: "",
        repo: "",
        gitlab_url: "",
      }));
    } else {
      handleBaseChange(e);
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

  const buildSyncOptions = (): Record<string, unknown> => {
    const opts: Record<string, unknown> = {};
    if (formData.owner) opts.owner = formData.owner;
    if (formData.repo) opts.repo = formData.repo;
    if (formData.provider === "gitlab" && formData.gitlab_url) {
      opts.gitlab_url = formData.gitlab_url;
    }
    return opts;
  };

  const handleSubmit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    startTransition(async () => {
      try {
        let result: { error?: string } | undefined;
        const syncOptions = buildSyncOptions();
        if (initialData) {
          result = await updateSyncConfig(initialData.id, {
            sync_targets: formData.sync_targets,
            is_active: formData.is_active,
            schedule_cron: formData.schedule_cron,
            timezone: formData.timezone,
            initial_sync_depth: formData.initial_sync_depth,
            sync_options: syncOptions,
          });
        } else {
          result = await createSyncConfig({
            name: formData.name,
            provider: formData.provider,
            credential_id: formData.credential_id || null,
            sync_targets: formData.sync_targets,
            schedule_cron: formData.schedule_cron,
            timezone: formData.timezone,
            initial_sync_depth: formData.initial_sync_depth,
            sync_options: syncOptions,
          });
        }

        if (result?.error) {
          toast.error(result.error);
        } else {
          toast.success(initialData ? "Config updated" : "Config created");
          if (onSuccessAction) {
            onSuccessAction();
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
    <>
      <BaseForm
        onSubmitAction={handleSubmit}
        isLoading={isPending}
        submitLabel={isPending ? "Saving..." : initialData ? "Update Configuration" : "Create Configuration"}
        className="max-w-2xl space-y-6"
        contentClassName="space-y-6 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6"
        actionsClassName="flex items-center gap-4"
        actionsStart={
          <Link
            href="/admin/sync"
            className="rounded-lg px-4 py-2 text-sm font-medium text-(--ink-muted) hover:text-foreground"
          >
            Cancel
          </Link>
        }
      >
        
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
            className={`${inputClass} text-sm disabled:opacity-50`}
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
            className={`${inputClass} text-sm disabled:opacity-50`}
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
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="credential_id" className="block text-sm font-medium">
                Credential
              </label>
              <button
                type="button"
                onClick={() => setShowCredentialModal(true)}
                className="rounded-md border border-(--card-stroke) px-2 py-1 text-xs font-medium text-(--foreground) hover:bg-(--card-70)"
              >
                + New
              </button>
            </div>
          <select
            id="credential_id"
            name="credential_id"
            value={formData.credential_id}
            onChange={handleChange}
            disabled={!!initialData} // Changing credential might require re-auth flow, keep simple for now
            className={`${inputClass} text-sm disabled:opacity-50`}
          >
            <option value="">Select a credential...</option>
            {filteredCredentials.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {filteredCredentials.length === 0 && !initialData && (
            <div className="mt-1 flex items-center gap-1 text-xs text-amber-500">
              <span>No credentials found for this provider.</span>
              <Link href="/admin/integrations" className="underline">
                Add one first
              </Link>
              <span>or</span>
              <button
                type="button"
                onClick={() => setShowCredentialModal(true)}
                className="underline"
              >
                Create One Now
              </button>
              <span>.</span>
            </div>
          )}
          </div>

        {/* Repository Settings */}
        {(formData.provider === "github" || formData.provider === "gitlab") && (
          <div className="space-y-4">
            <span className="mb-2 block text-sm font-medium">Repository</span>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="owner" className="mb-1.5 block text-sm font-medium text-(--ink-muted)">
                  Owner / Organization
                </label>
                <input
                  type="text"
                  id="owner"
                  name="owner"
                  value={formData.owner}
                  onChange={handleChange}
                  className={`${inputClass} text-sm disabled:opacity-50`}
                  placeholder="e.g., myorg"
                />
              </div>
              <div>
                <label htmlFor="repo" className="mb-1.5 block text-sm font-medium text-(--ink-muted)">
                  Repository
                </label>
                <input
                  type="text"
                  id="repo"
                  name="repo"
                  value={formData.repo}
                  onChange={handleChange}
                  className={`${inputClass} text-sm disabled:opacity-50`}
                  placeholder="e.g., my-repo or * for all"
                />
              </div>
            </div>
            {formData.provider === "gitlab" && (
              <div>
                <label htmlFor="gitlab_url" className="mb-1.5 block text-sm font-medium text-(--ink-muted)">
                  GitLab URL
                </label>
                <input
                  type="text"
                  id="gitlab_url"
                  name="gitlab_url"
                  value={formData.gitlab_url}
                  onChange={handleChange}
                  className={`${inputClass} text-sm disabled:opacity-50`}
                  placeholder="https://gitlab.com"
                />
              </div>
            )}
            <p className="text-xs text-(--ink-muted)">
              Leave empty to use the config name as owner/repo. Use * for repo to sync all repositories.
            </p>
          </div>
        )}

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

        {/* Initial Sync Depth */}
        <div className="space-y-3">
          <span className="text-sm font-medium text-[var(--text-primary)]">
            Initial Sync Depth
          </span>
          <p className="text-xs text-[var(--text-secondary)]">
            How far back to pull historical data when first connecting.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              { label: "30 days", value: 30, tier: null },
              { label: "90 days", value: 90, tier: "team" },
              { label: "6 months", value: 180, tier: "team" },
              { label: "1 year", value: 365, tier: "enterprise" },
              { label: "All time", value: 0, tier: "enterprise" },
            ].map((opt) => {
              const isSelected = (formData.initial_sync_depth ?? 30) === opt.value;
              const isGated = !!opt.tier && !features[`initial_sync_depth`];
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={isGated}
                  onClick={() => setFormData(prev => ({ ...prev, initial_sync_depth: opt.value }))}
                  className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                    isSelected
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                      : isGated
                      ? "cursor-not-allowed border-[var(--card-stroke)] bg-[var(--bg-secondary)] text-[var(--text-tertiary)] opacity-50"
                      : "border-[var(--card-stroke)] hover:border-[var(--accent)]/50"
                  }`}
                >
                  {opt.label}
                  {isGated && <span className="ml-1 text-[10px]">🔒</span>}
                </button>
              );
            })}
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

        <UpgradeGate feature="custom_scheduling" requiredTier="enterprise">
          <SchedulePicker
            value={formData.schedule_cron}
            timezone={formData.timezone}
            onChange={(cron, tz) =>
              setFormData((prev) => ({ ...prev, schedule_cron: cron, timezone: tz }))
            }
          />
        </UpgradeGate>

      </BaseForm>

      {showCredentialModal && (
        <CreateCredentialModal
          isOpen={showCredentialModal}
          onCloseAction={() => setShowCredentialModal(false)}
          provider={formData.provider as Provider}
          onCreatedAction={(credential) => {
            setLocalCredentials((prev) => [...prev, credential]);
            setFormData((prev) => ({ ...prev, credential_id: credential.id }));
            setShowCredentialModal(false);
          }}
        />
      )}
    </>
  );
}
