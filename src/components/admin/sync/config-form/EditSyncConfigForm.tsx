"use client";

import Link from "next/link";
import type { ChangeEvent, SyntheticEvent } from "react";
import { BaseForm } from "@/components/shared/BaseForm";
import { CTA_LABELS } from "@/lib/design/cta";
import type { IntegrationCredential } from "@/lib/admin/types";
import { IdentitySection } from "./IdentitySection";
import { CredentialSection } from "./CredentialSection";
import { RepositoryScopeSection } from "./RepositoryScopeSection";
import { DatasetsSection } from "./DatasetsSection";
import { InitialDepthSection } from "./InitialDepthSection";
import { ScheduleSection } from "./ScheduleSection";
import { AdvancedSection } from "./AdvancedSection";

type EditSyncConfigFormData = {
    name: string;
    provider: string;
    credential_id: string;
    sync_targets: string[];
    is_active: boolean;
    schedule_cron: string | null;
    timezone: string | null;
    initial_sync_depth: number | null;
    owner: string;
    repos: string[];
    gitlab_url: string;
    auto_import_teams: boolean;
};

type EditSyncConfigFormProps = {
    formData: EditSyncConfigFormData;
    credentialName: string | null;
    filteredCredentials: IntegrationCredential[];
    availableTargets: { id: string; label: string }[];
    syncAllRepos: boolean;
    onSyncAllReposChangeAction: (checked: boolean) => void;
    canBrowseRepos: boolean;
    maxRepos?: number;
    repoScopeWarnings: string[];
    datasetWarnings: string[];
    isDepthTierGated: (tier: "team" | "enterprise" | null) => boolean;
    minSyncIntervalHours?: number;
    onChangeAction: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    onTargetChangeAction: (targetId: string, checked: boolean) => void;
    onReposChangeAction: (repos: string[]) => void;
    onDepthChangeAction: (value: number) => void;
    onScheduleChangeAction: (cron: string | null, timezone: string | null) => void;
    onActiveChangeAction: (checked: boolean) => void;
    onAutoImportChangeAction: (checked: boolean) => void;
    onOpenCreateCredentialModalAction: () => void;
    onSubmitAction: (event: SyntheticEvent<HTMLFormElement>) => void;
    isPending: boolean;
};

/**
 * Single-page sync-config edit layout (CHAOS-2838): every section stays
 * visible at once, unlike the guided create wizard — identity, provider,
 * and credential are immutable once created (ImmutableField), so there's
 * no sequential prerequisite chain left to gate. Destructive-change
 * warnings surface inline per-section; the caller gates the actual submit
 * behind a ConfirmDialog when any are staged.
 */
export function EditSyncConfigForm({
    formData,
    credentialName,
    filteredCredentials,
    availableTargets,
    syncAllRepos,
    onSyncAllReposChangeAction,
    canBrowseRepos,
    maxRepos,
    repoScopeWarnings,
    datasetWarnings,
    isDepthTierGated,
    minSyncIntervalHours,
    onChangeAction,
    onTargetChangeAction,
    onReposChangeAction,
    onDepthChangeAction,
    onScheduleChangeAction,
    onActiveChangeAction,
    onAutoImportChangeAction,
    onOpenCreateCredentialModalAction,
    onSubmitAction,
    isPending,
}: EditSyncConfigFormProps) {
    return (
        <BaseForm
            onSubmitAction={onSubmitAction}
            isLoading={isPending}
            submitLabel={
                isPending ? CTA_LABELS.savingConfiguration : CTA_LABELS.updateConfiguration
            }
            className="max-w-2xl space-y-6"
            contentClassName="space-y-4 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6"
            actionsClassName="flex items-center gap-4"
            actionsStart={
                <Link
                    href="/org/admin/sync"
                    className="rounded-lg px-4 py-2 text-sm font-medium text-(--ink-muted) hover:text-foreground"
                >
                    {CTA_LABELS.cancel}
                </Link>
            }
        >
            <IdentitySection
                isEdit
                name={formData.name}
                provider={formData.provider}
                onChange={onChangeAction}
            />

            <CredentialSection
                isEdit
                credentialId={formData.credential_id}
                credentialName={credentialName}
                filteredCredentials={filteredCredentials}
                onChange={onChangeAction}
                onOpenCreateModal={onOpenCreateCredentialModalAction}
            />

            {(formData.provider === "github" || formData.provider === "gitlab") && (
                <RepositoryScopeSection
                    provider={formData.provider}
                    owner={formData.owner}
                    gitlabUrl={formData.gitlab_url}
                    onChange={onChangeAction}
                    isEdit
                    syncAllRepos={syncAllRepos}
                    onSyncAllReposChange={onSyncAllReposChangeAction}
                    canBrowseRepos={canBrowseRepos}
                    credentialId={formData.credential_id}
                    repos={formData.repos}
                    onReposChange={onReposChangeAction}
                    maxRepos={maxRepos}
                    destructiveWarnings={repoScopeWarnings}
                />
            )}

            <DatasetsSection
                availableTargets={availableTargets}
                selectedTargets={formData.sync_targets}
                onTargetChange={onTargetChangeAction}
                destructiveWarnings={datasetWarnings}
            />

            <InitialDepthSection
                value={formData.initial_sync_depth}
                onChange={onDepthChangeAction}
                isTierGated={isDepthTierGated}
            />

            <ScheduleSection
                isActive={formData.is_active}
                onIsActiveChange={onActiveChangeAction}
                scheduleCron={formData.schedule_cron}
                timezone={formData.timezone}
                onScheduleChange={onScheduleChangeAction}
                minIntervalHours={minSyncIntervalHours}
            />

            <AdvancedSection
                provider={formData.provider}
                autoImportTeams={formData.auto_import_teams}
                onChange={onAutoImportChangeAction}
            />
        </BaseForm>
    );
}
