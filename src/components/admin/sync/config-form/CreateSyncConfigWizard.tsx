"use client";

import { useMemo, useState, type ChangeEvent, type SyntheticEvent } from "react";
import Link from "next/link";
import { CTA_LABELS } from "@/lib/design/cta";
import { IdentitySection } from "./IdentitySection";
import { CredentialSection } from "./CredentialSection";
import { RepositoryScopeSection } from "./RepositoryScopeSection";
import { DatasetsSection } from "./DatasetsSection";
import { InitialDepthSection } from "./InitialDepthSection";
import { ScheduleSection } from "./ScheduleSection";
import { AdvancedSection } from "./AdvancedSection";
import { StepProgress } from "./StepProgress";
import { StepNav } from "./StepNav";
import { ReviewStep } from "./ReviewStep";
import {
    formatDepthLabel,
    formatScheduleLabel,
    DATASET_LABELS,
    AUTO_IMPORT_PROVIDERS,
} from "./constants";
import { getVisibleSteps, getStepBlockReason, isRepoScopedProvider } from "./wizardSteps";
import { PROVIDER_LABELS, type Provider } from "@/lib/admin/types";
import type { IntegrationCredential } from "@/lib/admin/types";

type CreateSyncConfigWizardFormData = {
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

type CreateSyncConfigWizardProps = {
    formData: CreateSyncConfigWizardFormData;
    credentialName: string | null;
    filteredCredentials: IntegrationCredential[];
    availableTargets: { id: string; label: string }[];
    syncAllRepos: boolean;
    onSyncAllReposChangeAction: (checked: boolean) => void;
    maxRepos?: number;
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
 * Guided, step-by-step sync-config creation flow (CHAOS-2838): provider →
 * credential → repository/source scope → datasets → depth/schedule →
 * review. Orchestrates the existing IA section components as wizard
 * steps rather than reimplementing their field logic.
 */
export function CreateSyncConfigWizard({
    formData,
    credentialName,
    filteredCredentials,
    availableTargets,
    syncAllRepos,
    onSyncAllReposChangeAction,
    maxRepos,
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
}: CreateSyncConfigWizardProps) {
    const visibleSteps = useMemo(() => getVisibleSteps(formData.provider), [formData.provider]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const clampedIndex = Math.min(currentIndex, visibleSteps.length - 1);
    const currentStep = visibleSteps[clampedIndex];

    const blockReason = getStepBlockReason(currentStep.id, {
        name: formData.name,
        credentialId: formData.credential_id,
    });

    function goToStep(index: number) {
        if (index <= clampedIndex) setCurrentIndex(index);
    }
    function goNext() {
        if (blockReason) return;
        setCurrentIndex((i) => Math.min(i + 1, visibleSteps.length - 1));
    }
    function goBack() {
        setCurrentIndex((i) => Math.max(i - 1, 0));
    }

    const isRepoScoped = isRepoScopedProvider(formData.provider);
    const showAutoImport = AUTO_IMPORT_PROVIDERS.includes(formData.provider);

    return (
        <form onSubmit={onSubmitAction} className="max-w-2xl space-y-6">
            <div className="flex items-center justify-between gap-4">
                <StepProgress
                    steps={visibleSteps}
                    currentIndex={clampedIndex}
                    onStepClickAction={goToStep}
                />
                <Link
                    href="/org/admin/sync"
                    className="shrink-0 text-sm font-medium text-(--ink-muted) hover:text-foreground"
                >
                    {CTA_LABELS.cancel}
                </Link>
            </div>

            <div className="space-y-6 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6">
                {currentStep.id === "provider" && (
                    <IdentitySection
                        isEdit={false}
                        name={formData.name}
                        provider={formData.provider}
                        onChange={onChangeAction}
                    />
                )}

                {currentStep.id === "credential" && (
                    <CredentialSection
                        isEdit={false}
                        credentialId={formData.credential_id}
                        credentialName={credentialName}
                        filteredCredentials={filteredCredentials}
                        onChange={onChangeAction}
                        onOpenCreateModal={onOpenCreateCredentialModalAction}
                    />
                )}

                {currentStep.id === "scope" && (
                    <RepositoryScopeSection
                        provider={formData.provider}
                        owner={formData.owner}
                        gitlabUrl={formData.gitlab_url}
                        onChange={onChangeAction}
                        isEdit={false}
                        syncAllRepos={syncAllRepos}
                        onSyncAllReposChange={onSyncAllReposChangeAction}
                        canBrowseRepos
                        credentialId={formData.credential_id}
                        repos={formData.repos}
                        onReposChange={onReposChangeAction}
                        maxRepos={maxRepos}
                        destructiveWarnings={[]}
                    />
                )}

                {currentStep.id === "datasets" && (
                    <>
                        <DatasetsSection
                            availableTargets={availableTargets}
                            selectedTargets={formData.sync_targets}
                            onTargetChange={onTargetChangeAction}
                            destructiveWarnings={[]}
                        />
                        <AdvancedSection
                            provider={formData.provider}
                            autoImportTeams={formData.auto_import_teams}
                            onChange={onAutoImportChangeAction}
                        />
                    </>
                )}

                {currentStep.id === "depth" && (
                    <>
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
                    </>
                )}

                {currentStep.id === "review" && (
                    <ReviewStep
                        name={formData.name}
                        providerLabel={
                            PROVIDER_LABELS[formData.provider as Provider] ?? formData.provider
                        }
                        credentialName={credentialName}
                        isRepoScoped={isRepoScoped}
                        syncAllRepos={syncAllRepos}
                        owner={formData.owner}
                        repoCount={formData.repos.length}
                        datasetLabels={formData.sync_targets.map((id) => DATASET_LABELS[id] ?? id)}
                        showAutoImport={showAutoImport}
                        autoImportTeams={formData.auto_import_teams}
                        depthLabel={formatDepthLabel(formData.initial_sync_depth)}
                        scheduleLabel={formatScheduleLabel(formData.schedule_cron)}
                        timezone={formData.timezone}
                        isActive={formData.is_active}
                        isPending={isPending}
                        onBackAction={goBack}
                    />
                )}
            </div>

            {currentStep.id !== "review" && (
                <StepNav
                    onBackAction={clampedIndex > 0 ? goBack : undefined}
                    onContinueAction={goNext}
                    blockReason={blockReason}
                />
            )}
        </form>
    );
}
