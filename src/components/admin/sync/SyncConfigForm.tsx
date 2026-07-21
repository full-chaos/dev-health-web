"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    useTransition,
    type ChangeEvent,
    type SyntheticEvent,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    SyncConfig,
    IntegrationCredential,
    Provider,
    PROVIDER_SYNC_TARGETS,
    SyncConfigRepositorySelection,
} from "@/lib/admin/types";
import {
    batchCreateSyncConfigs,
    createSyncConfig,
    updateSyncConfig,
    updateSyncConfigRepositories,
} from "@/lib/admin/server";
import { useAdminTier } from "@/components/admin/AdminTierContext";
import { useBaseFormState } from "@/components/shared/BaseForm";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { CreateCredentialModal } from "./CreateCredentialModal";
import {
    AUTO_IMPORT_PROVIDERS,
    getSyncTargetsForProvider,
    sameRepoSelection,
} from "./config-form/constants";
import {
    buildChangeSummary,
    getDatasetWarnings,
    getRepoScopeWarnings,
} from "./config-form/formDiff";
import type { SyncFormSnapshot } from "./config-form/formDiff";
import { CreateSyncConfigWizard } from "./config-form/CreateSyncConfigWizard";
import { EditSyncConfigForm } from "./config-form/EditSyncConfigForm";
import type { PagerDutyMappingValidity } from "./config-form/PagerDutyServiceMappings";
import {
    mergePagerDutyAdminMappings,
    readPagerDutyAdminMappings,
} from "./config-form/pagerDutyMappingOptions";
import type { ServiceRepositoryMappings } from "@/lib/admin/pagerduty";

type SyncConfigFormProps = {
    canCreatePagerDuty?: boolean;
    initialData?: SyncConfig;
    initialRepositorySelection?: SyncConfigRepositorySelection;
    credentials: IntegrationCredential[];
    onSuccessAction?: () => void;
};

function buildInitialFormValues(
    initialData: SyncConfig | undefined,
    initialRepositorySelection: SyncConfigRepositorySelection | undefined,
) {
    return {
        name: initialData?.name || "",
        provider: initialData?.provider || "github",
        credential_id: initialData?.credential_id || "",
        sync_targets: initialData?.sync_targets || [],
        is_active: initialData?.is_active ?? true,
        schedule_cron:
            initialData?.schedule_cron ??
            (initialData?.sync_options?.schedule_cron as string | null | undefined) ??
            null,
        timezone:
            initialData?.timezone ??
            (initialData?.sync_options?.timezone as string | null | undefined) ??
            null,
        initial_sync_depth: (initialData?.initial_sync_depth ??
            (initialData?.sync_options?.initial_sync_depth as number | null | undefined) ??
            30) as number | null,
        owner:
            initialRepositorySelection?.owner || (initialData?.sync_options?.owner as string) || "",
        repos: initialRepositorySelection?.repos || ([] as string[]),
        gitlab_url: (initialData?.sync_options?.gitlab_url as string) || "",
        auto_import_teams: (initialData?.sync_options?.auto_import_teams as boolean) ?? false,
        serviceRepositoryMappings: readPagerDutyAdminMappings(initialData?.sync_options),
    };
}

function toSnapshot(
    formData: ReturnType<typeof buildInitialFormValues>,
    syncAllRepos: boolean,
): SyncFormSnapshot {
    return {
        sync_targets: formData.sync_targets,
        is_active: formData.is_active,
        schedule_cron: formData.schedule_cron,
        timezone: formData.timezone,
        initial_sync_depth: formData.initial_sync_depth,
        owner: formData.owner,
        gitlab_url: formData.gitlab_url,
        auto_import_teams: formData.auto_import_teams,
        repos: formData.repos,
        syncAllRepos,
    };
}

export function SyncConfigForm({
    canCreatePagerDuty = false,
    initialData,
    initialRepositorySelection,
    credentials,
    onSuccessAction,
}: SyncConfigFormProps) {
    const router = useRouter();
    const isEdit = !!initialData;
    const [isPending, startTransition] = useTransition();
    const [showCredentialModal, setShowCredentialModal] = useState(false);
    const [showDestructiveConfirm, setShowDestructiveConfirm] = useState(false);
    const [localCredentials, setLocalCredentials] = useState(credentials);
    const [serviceRepositoryMappingsValidity, setServiceRepositoryMappingsValidity] =
        useState<PagerDutyMappingValidity>({ valid: true });
    const { tier, minSyncIntervalHours, limits } = useAdminTier();
    const maxRepos = (limits?.licensed_repos as number | null | undefined) ?? undefined;
    const [syncAllRepos, setSyncAllRepos] = useState(
        initialRepositorySelection?.sync_all_repos ??
            ((initialData?.sync_options?.all_repos as boolean | undefined) || false),
    );
    // Snapshot of the values the form was seeded with, updated to the
    // just-saved values on a successful edit — so destructive-change
    // warnings and the post-save diff summary are always computed
    // relative to the config's current persisted state, not the values
    // the page happened to load with (CHAOS-2797).
    const [baseline, setBaseline] = useState<SyncFormSnapshot>(() =>
        toSnapshot(
            buildInitialFormValues(initialData, initialRepositorySelection),
            initialRepositorySelection?.sync_all_repos ??
                ((initialData?.sync_options?.all_repos as boolean | undefined) || false),
        ),
    );

    const {
        formData,
        setFormData,
        handleChange: handleBaseChange,
    } = useBaseFormState(buildInitialFormValues(initialData, initialRepositorySelection));

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- local credentials intentionally mirror updated server props.
        setLocalCredentials(credentials);
    }, [credentials]);

    const filteredCredentials = useMemo(
        () => localCredentials.filter((c) => c.provider === formData.provider),
        [localCredentials, formData.provider],
    );

    const credentialName = useMemo(
        () => localCredentials.find((c) => c.id === formData.credential_id)?.name ?? null,
        [localCredentials, formData.credential_id],
    );

    const availableTargets = useMemo(
        () => getSyncTargetsForProvider(formData.provider),
        [formData.provider],
    );
    const canBrowseRepos = !initialData || !!initialRepositorySelection;

    const currentSnapshot = useMemo(
        () => toSnapshot(formData, syncAllRepos),
        [formData, syncAllRepos],
    );
    const repoScopeWarnings = useMemo(
        () => (isEdit ? getRepoScopeWarnings(baseline, currentSnapshot) : []),
        [isEdit, baseline, currentSnapshot],
    );
    const datasetWarnings = useMemo(
        () => (isEdit ? getDatasetWarnings(baseline, currentSnapshot) : []),
        [isEdit, baseline, currentSnapshot],
    );
    const combinedDestructiveWarnings = useMemo(
        () => [...repoScopeWarnings, ...datasetWarnings],
        [repoScopeWarnings, datasetWarnings],
    );

    const handleChange = useCallback(
        (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
            const { name, value, type } = e.target;

            if (type === "checkbox" && name === "is_active") {
                setFormData((prev) => ({
                    ...prev,
                    is_active: (e.target as HTMLInputElement).checked,
                }));
            } else if (name === "provider") {
                const newAllowed = PROVIDER_SYNC_TARGETS[value as Provider] ?? [];
                setFormData((prev) => ({
                    ...prev,
                    provider: value,
                    sync_targets: prev.sync_targets.filter((t) => newAllowed.includes(t)),
                    credential_id: "",
                    owner: "",
                    repos: [],
                    gitlab_url: "",
                    serviceRepositoryMappings: {},
                }));
                setSyncAllRepos(false);
                setServiceRepositoryMappingsValidity({ valid: true });
            } else if (name === "owner" || name === "credential_id") {
                setFormData((prev) => ({
                    ...prev,
                    [name]: value,
                    repos: [],
                }));
            } else {
                handleBaseChange(e);
            }
        },
        [handleBaseChange, setFormData, setSyncAllRepos],
    );

    const handleServiceRepositoryMappingsValidityChange = useCallback(
        (validity: PagerDutyMappingValidity) => setServiceRepositoryMappingsValidity(validity),
        [],
    );

    const handleServiceRepositoryMappingsChange = useCallback(
        (serviceRepositoryMappings: ServiceRepositoryMappings) =>
            setFormData((previous) => ({ ...previous, serviceRepositoryMappings })),
        [setFormData],
    );

    const handleActiveChange = useCallback(
        (checked: boolean) => setFormData((prev) => ({ ...prev, is_active: checked })),
        [setFormData],
    );

    const handleDepthChange = useCallback(
        (value: number) => setFormData((prev) => ({ ...prev, initial_sync_depth: value })),
        [setFormData],
    );

    const handleScheduleChange = useCallback(
        (cron: string | null, timezone: string | null) =>
            setFormData((prev) => ({ ...prev, schedule_cron: cron, timezone })),
        [setFormData],
    );

    const handleAutoImportChange = useCallback(
        (checked: boolean) => setFormData((prev) => ({ ...prev, auto_import_teams: checked })),
        [setFormData],
    );

    const handleOpenCreateCredential = useCallback(() => {
        if (formData.provider === "pagerduty") {
            router.push("/org/admin/integrations/pagerduty");
            return;
        }
        setShowCredentialModal(true);
    }, [formData.provider, router]);

    const handleTargetChange = useCallback(
        (targetId: string, checked: boolean) => {
            if (!checked && targetId === "operational" && formData.provider === "pagerduty") {
                setFormData((previous) => ({ ...previous, serviceRepositoryMappings: {} }));
                setServiceRepositoryMappingsValidity({ valid: true });
            }
            setFormData((prev) => {
                const newTargets = checked
                    ? [...prev.sync_targets, targetId]
                    : prev.sync_targets.filter((t) => t !== targetId);
                return { ...prev, sync_targets: newTargets };
            });
        },
        [formData.provider, setFormData],
    );

    const handleReposChange = useCallback(
        (repos: string[]) => setFormData((prev) => ({ ...prev, repos })),
        [setFormData],
    );

    const buildSyncOptions = useCallback((): Record<string, unknown> => {
        const opts: Record<string, unknown> = {
            ...(initialData?.sync_options ?? {}),
        };
        // schedule_cron / timezone / initial_sync_depth are owned by the
        // top-level payload fields. Strip stale copies from the carried-over
        // sync_options so they can never resurrect an old schedule on save.
        delete opts.schedule_cron;
        delete opts.timezone;
        delete opts.initial_sync_depth;
        if (formData.owner) opts.owner = formData.owner;
        if (formData.provider === "gitlab" && formData.gitlab_url) {
            opts.gitlab_url = formData.gitlab_url;
        }
        // Auto-import teams/projects/members is only meaningful for providers
        // with work-item/team attribution. Persist the explicit boolean for
        // those, and strip any stale flag when switched to an unsupported
        // provider so it never rides along inappropriately.
        if (AUTO_IMPORT_PROVIDERS.includes(formData.provider)) {
            opts.auto_import_teams = formData.auto_import_teams;
        } else {
            delete opts.auto_import_teams;
        }
        return mergePagerDutyAdminMappings(
            opts,
            formData.provider === "pagerduty" && formData.sync_targets.includes("operational")
                ? formData.serviceRepositoryMappings
                : {},
        );
    }, [
        initialData,
        formData.owner,
        formData.provider,
        formData.sync_targets,
        formData.gitlab_url,
        formData.auto_import_teams,
        formData.serviceRepositoryMappings,
    ]);

    const performUpdate = useCallback(async () => {
        if (!initialData) return;
        try {
            const syncOptions = buildSyncOptions();
            const result = await updateSyncConfig(initialData.id, {
                sync_targets: formData.sync_targets,
                is_active: formData.is_active,
                schedule_cron: formData.schedule_cron,
                timezone: formData.timezone,
                initial_sync_depth: formData.initial_sync_depth,
                sync_options: syncOptions,
            });
            if (result?.error) {
                toast.error(result.error);
                return;
            }
            const savedSnapshot = toSnapshot(formData, syncAllRepos);
            const shouldUpdateRepos = Boolean(
                (formData.provider === "github" || formData.provider === "gitlab") &&
                !syncAllRepos &&
                formData.owner &&
                (!sameRepoSelection(initialRepositorySelection?.repos ?? [], formData.repos) ||
                    (initialRepositorySelection?.owner ?? "") !== formData.owner),
            );
            if (shouldUpdateRepos) {
                const repoResult = await updateSyncConfigRepositories(initialData.id, {
                    owner: formData.owner,
                    repos: formData.repos,
                });
                if (repoResult?.error) {
                    toast.error(repoResult.error);
                    return;
                }
            }
            const changeSummary = buildChangeSummary(baseline, savedSnapshot);
            toast.success(
                "Config updated",
                changeSummary.length > 0
                    ? { description: `Changed: ${changeSummary.join("; ")}` }
                    : undefined,
            );
            setBaseline(savedSnapshot);
            if (onSuccessAction) {
                onSuccessAction();
            } else {
                // Stay on the edit page — the config was just saved here, not
                // somewhere else — and pull fresh server data via revalidated
                // props.
                router.refresh();
            }
        } catch {
            toast.error("An unexpected error occurred");
        }
    }, [
        initialData,
        initialRepositorySelection,
        formData,
        syncAllRepos,
        buildSyncOptions,
        baseline,
        onSuccessAction,
        router,
    ]);

    const performCreate = useCallback(async () => {
        try {
            const syncOptions = buildSyncOptions();
            const base = {
                name: formData.name,
                provider: formData.provider,
                credential_id: formData.credential_id || null,
                sync_targets: formData.sync_targets,
                schedule_cron: formData.schedule_cron,
                timezone: formData.timezone,
                initial_sync_depth: formData.initial_sync_depth,
                sync_options: syncOptions,
            };

            let result: { error?: string } | undefined;
            if (syncAllRepos) {
                // Token-wide signal: the backend enumerates every repository
                // the credential can access when `all_repos` is true. `owner`
                // rides along only when provided (buildSyncOptions adds it
                // when truthy) to optionally scope to a single org.
                result = await createSyncConfig({
                    ...base,
                    sync_options: { ...syncOptions, all_repos: true },
                });
                if (result?.error) {
                    toast.error(result.error);
                    return;
                }
                toast.success("Config created");
            } else if (formData.repos.length > 0) {
                result = await batchCreateSyncConfigs({ ...base, repos: formData.repos });
                if (result?.error) {
                    toast.error(result.error);
                    return;
                }
                const count =
                    (result as { data?: { count?: number } })?.data?.count ?? formData.repos.length;
                toast.success(`Created config with ${count} repos`);
            } else {
                result = await createSyncConfig(base);
                if (result?.error) {
                    toast.error(result.error);
                    return;
                }
                toast.success("Config created");
            }
            if (onSuccessAction) {
                onSuccessAction();
            } else {
                router.push("/org/admin/sync");
            }
        } catch {
            toast.error("An unexpected error occurred");
        }
    }, [formData, syncAllRepos, buildSyncOptions, onSuccessAction, router]);

    const handleSubmit = useCallback(
        (e: SyntheticEvent<HTMLFormElement>) => {
            e.preventDefault();
            if (
                formData.provider === "pagerduty" &&
                formData.sync_targets.includes("operational") &&
                !serviceRepositoryMappingsValidity.valid
            ) {
                document.getElementById("pagerduty-service-repository-mappings")?.focus();
                return;
            }
            if (initialData) {
                if (combinedDestructiveWarnings.length > 0) {
                    setShowDestructiveConfirm(true);
                    return;
                }
                startTransition(performUpdate);
            } else {
                startTransition(performCreate);
            }
        },
        [
            initialData,
            combinedDestructiveWarnings,
            formData.provider,
            formData.sync_targets,
            serviceRepositoryMappingsValidity,
            performUpdate,
            performCreate,
        ],
    );

    const handleConfirmDestructive = useCallback(() => {
        setShowDestructiveConfirm(false);
        startTransition(performUpdate);
    }, [performUpdate]);

    return (
        <>
            {isEdit ? (
                <EditSyncConfigForm
                    formData={formData}
                    credentialName={credentialName}
                    filteredCredentials={filteredCredentials}
                    availableTargets={availableTargets}
                    syncAllRepos={syncAllRepos}
                    onSyncAllReposChangeAction={setSyncAllRepos}
                    canBrowseRepos={canBrowseRepos}
                    maxRepos={maxRepos}
                    repoScopeWarnings={repoScopeWarnings}
                    datasetWarnings={datasetWarnings}
                    serviceRepositoryMappings={formData.serviceRepositoryMappings}
                    onServiceRepositoryMappingsChangeAction={handleServiceRepositoryMappingsChange}
                    onServiceRepositoryMappingsValidityChangeAction={
                        handleServiceRepositoryMappingsValidityChange
                    }
                    tier={tier}
                    minSyncIntervalHours={minSyncIntervalHours}
                    onChangeAction={handleChange}
                    onTargetChangeAction={handleTargetChange}
                    onReposChangeAction={handleReposChange}
                    onDepthChangeAction={handleDepthChange}
                    onScheduleChangeAction={handleScheduleChange}
                    onActiveChangeAction={handleActiveChange}
                    onAutoImportChangeAction={handleAutoImportChange}
                    onOpenCreateCredentialModalAction={handleOpenCreateCredential}
                    onSubmitAction={handleSubmit}
                    isPending={isPending}
                />
            ) : (
                <CreateSyncConfigWizard
                    canCreatePagerDuty={canCreatePagerDuty}
                    formData={formData}
                    credentialName={credentialName}
                    filteredCredentials={filteredCredentials}
                    availableTargets={availableTargets}
                    syncAllRepos={syncAllRepos}
                    onSyncAllReposChangeAction={setSyncAllRepos}
                    maxRepos={maxRepos}
                    tier={tier}
                    minSyncIntervalHours={minSyncIntervalHours}
                    serviceRepositoryMappings={formData.serviceRepositoryMappings}
                    serviceRepositoryMappingsValidity={serviceRepositoryMappingsValidity}
                    onServiceRepositoryMappingsChangeAction={handleServiceRepositoryMappingsChange}
                    onServiceRepositoryMappingsValidityChangeAction={
                        handleServiceRepositoryMappingsValidityChange
                    }
                    onChangeAction={handleChange}
                    onTargetChangeAction={handleTargetChange}
                    onReposChangeAction={handleReposChange}
                    onDepthChangeAction={handleDepthChange}
                    onScheduleChangeAction={handleScheduleChange}
                    onActiveChangeAction={handleActiveChange}
                    onAutoImportChangeAction={handleAutoImportChange}
                    onOpenCreateCredentialModalAction={handleOpenCreateCredential}
                    onSubmitAction={handleSubmit}
                    isPending={isPending}
                />
            )}

            <ConfirmDialog
                isOpen={showDestructiveConfirm}
                title="Confirm destructive changes"
                description={
                    <ul className="list-disc space-y-1 pl-4">
                        {combinedDestructiveWarnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                        ))}
                    </ul>
                }
                tone="destructive"
                isPending={isPending}
                onConfirmAction={handleConfirmDestructive}
                onCancelAction={() => setShowDestructiveConfirm(false)}
            />

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
