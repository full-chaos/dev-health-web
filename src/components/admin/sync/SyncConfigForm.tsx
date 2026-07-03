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
import Link from "next/link";
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
import { BaseForm, useBaseFormState } from "@/components/shared/BaseForm";
import { CTA_LABELS } from "@/lib/design/cta";
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
import { IdentitySection } from "./config-form/IdentitySection";
import { CredentialSection } from "./config-form/CredentialSection";
import { RepositoryScopeSection } from "./config-form/RepositoryScopeSection";
import { DatasetsSection } from "./config-form/DatasetsSection";
import { InitialDepthSection } from "./config-form/InitialDepthSection";
import { ScheduleSection } from "./config-form/ScheduleSection";
import { AdvancedSection } from "./config-form/AdvancedSection";

type SyncConfigFormProps = {
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
    initialData,
    initialRepositorySelection,
    credentials,
    onSuccessAction,
}: SyncConfigFormProps) {
    const router = useRouter();
    const isEdit = !!initialData;
    const [isPending, startTransition] = useTransition();
    const [showCredentialModal, setShowCredentialModal] = useState(false);
    const [localCredentials, setLocalCredentials] = useState(credentials);
    const { features, minSyncIntervalHours, limits } = useAdminTier();
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

    const isDepthTierGated = useCallback(
        (tier: "team" | "enterprise" | null) => !!tier && !features["initial_sync_depth"],
        [features],
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
                }));
                setSyncAllRepos(false);
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

    const handleTargetChange = useCallback(
        (targetId: string, checked: boolean) => {
            setFormData((prev) => {
                const newTargets = checked
                    ? [...prev.sync_targets, targetId]
                    : prev.sync_targets.filter((t) => t !== targetId);
                return { ...prev, sync_targets: newTargets };
            });
        },
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
        return opts;
    }, [
        initialData,
        formData.owner,
        formData.provider,
        formData.gitlab_url,
        formData.auto_import_teams,
    ]);

    const handleSubmit = useCallback(
        (e: SyntheticEvent<HTMLFormElement>) => {
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
                        if (result?.error) {
                            toast.error(result.error);
                        } else {
                            const savedSnapshot = toSnapshot(formData, syncAllRepos);
                            const shouldUpdateRepos = Boolean(
                                (formData.provider === "github" ||
                                    formData.provider === "gitlab") &&
                                !syncAllRepos &&
                                formData.owner &&
                                (!sameRepoSelection(
                                    initialRepositorySelection?.repos ?? [],
                                    formData.repos,
                                ) ||
                                    (initialRepositorySelection?.owner ?? "") !== formData.owner),
                            );
                            if (shouldUpdateRepos) {
                                const repoResult = await updateSyncConfigRepositories(
                                    initialData.id,
                                    {
                                        owner: formData.owner,
                                        repos: formData.repos,
                                    },
                                );
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
                                // Stay on the edit page — the config was just
                                // saved here, not somewhere else — and pull
                                // fresh server data via revalidated props.
                                router.refresh();
                            }
                        }
                    } else {
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

                        if (syncAllRepos) {
                            // Token-wide signal: the backend enumerates every
                            // repository the credential can access when
                            // `all_repos` is true. `owner` rides along only when
                            // provided (buildSyncOptions adds it when truthy) to
                            // optionally scope to a single org.
                            const allReposSyncOptions = {
                                ...syncOptions,
                                all_repos: true,
                            };
                            result = await createSyncConfig({
                                ...base,
                                sync_options: allReposSyncOptions,
                            });
                            if (result?.error) {
                                toast.error(result.error);
                            } else {
                                toast.success("Config created");
                                if (onSuccessAction) {
                                    onSuccessAction();
                                } else {
                                    router.push("/org/admin/sync");
                                }
                            }
                        } else if (formData.repos.length > 0) {
                            result = await batchCreateSyncConfigs({
                                ...base,
                                repos: formData.repos,
                            });
                            if (result?.error) {
                                toast.error(result.error);
                            } else {
                                const count =
                                    (result as { data?: { count?: number } })?.data?.count ??
                                    formData.repos.length;
                                toast.success(`Created config with ${count} repos`);
                                if (onSuccessAction) {
                                    onSuccessAction();
                                } else {
                                    router.push("/org/admin/sync");
                                }
                            }
                        } else {
                            result = await createSyncConfig(base);
                            if (result?.error) {
                                toast.error(result.error);
                            } else {
                                toast.success("Config created");
                                if (onSuccessAction) {
                                    onSuccessAction();
                                } else {
                                    router.push("/org/admin/sync");
                                }
                            }
                        }
                    }
                } catch {
                    toast.error("An unexpected error occurred");
                }
            });
        },
        [
            initialData,
            initialRepositorySelection,
            formData,
            syncAllRepos,
            buildSyncOptions,
            baseline,
            onSuccessAction,
            router,
        ],
    );

    return (
        <>
            <BaseForm
                onSubmitAction={handleSubmit}
                isLoading={isPending}
                submitLabel={
                    isPending
                        ? "Saving..."
                        : initialData
                          ? "Update Configuration"
                          : "Create Configuration"
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
                    isEdit={isEdit}
                    name={formData.name}
                    provider={formData.provider}
                    onChange={handleChange}
                />

                <CredentialSection
                    isEdit={isEdit}
                    credentialId={formData.credential_id}
                    credentialName={credentialName}
                    filteredCredentials={filteredCredentials}
                    onChange={handleChange}
                    onOpenCreateModal={() => setShowCredentialModal(true)}
                />

                {(formData.provider === "github" || formData.provider === "gitlab") && (
                    <RepositoryScopeSection
                        provider={formData.provider}
                        owner={formData.owner}
                        gitlabUrl={formData.gitlab_url}
                        onChange={handleChange}
                        isEdit={isEdit}
                        syncAllRepos={syncAllRepos}
                        onSyncAllReposChange={setSyncAllRepos}
                        canBrowseRepos={canBrowseRepos}
                        credentialId={formData.credential_id}
                        repos={formData.repos}
                        onReposChange={(repos) => setFormData((prev) => ({ ...prev, repos }))}
                        maxRepos={maxRepos}
                        destructiveWarnings={repoScopeWarnings}
                    />
                )}

                <DatasetsSection
                    availableTargets={availableTargets}
                    selectedTargets={formData.sync_targets}
                    onTargetChange={handleTargetChange}
                    destructiveWarnings={datasetWarnings}
                />

                <InitialDepthSection
                    value={formData.initial_sync_depth}
                    onChange={(value) =>
                        setFormData((prev) => ({ ...prev, initial_sync_depth: value }))
                    }
                    isTierGated={isDepthTierGated}
                />

                <ScheduleSection
                    isActive={formData.is_active}
                    onIsActiveChange={(checked) =>
                        setFormData((prev) => ({ ...prev, is_active: checked }))
                    }
                    scheduleCron={formData.schedule_cron}
                    timezone={formData.timezone}
                    onScheduleChange={(cron, tz) =>
                        setFormData((prev) => ({ ...prev, schedule_cron: cron, timezone: tz }))
                    }
                    minIntervalHours={minSyncIntervalHours}
                />

                <AdvancedSection
                    provider={formData.provider}
                    autoImportTeams={formData.auto_import_teams}
                    onChange={(checked) =>
                        setFormData((prev) => ({ ...prev, auto_import_teams: checked }))
                    }
                />
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
