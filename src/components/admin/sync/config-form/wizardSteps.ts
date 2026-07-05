/**
 * Guided sync-config creation flow (CHAOS-2838): step definitions and the
 * pure gating rules that decide when a step can be advanced past. Create
 * mode only — edit mode stays a single page (EditSyncConfigForm).
 */

export type SyncConfigStepId =
    "provider" | "credential" | "scope" | "datasets" | "depth" | "review";

export type SyncConfigStep = {
    id: SyncConfigStepId;
    label: string;
};

const ALL_STEPS: SyncConfigStep[] = [
    { id: "provider", label: "Provider" },
    { id: "credential", label: "Credential" },
    { id: "scope", label: "Repository & source scope" },
    { id: "datasets", label: "Datasets" },
    { id: "depth", label: "Depth & schedule" },
    { id: "review", label: "Review" },
];

/** Only github/gitlab configs have a repository/owner scope to narrow. */
export function isRepoScopedProvider(provider: string): boolean {
    return provider === "github" || provider === "gitlab";
}

/**
 * The step list actually shown for the given provider — the "scope" step
 * only applies to repo-scoped providers (github/gitlab); work-item-only
 * providers (jira/linear/launchdarkly) skip straight to datasets.
 */
export function getVisibleSteps(provider: string): SyncConfigStep[] {
    return ALL_STEPS.filter((step) => step.id !== "scope" || isRepoScopedProvider(provider));
}

export type StepGateContext = {
    name: string;
    credentialId: string;
};

/**
 * Returns a user-facing reason the current step can't be left yet, or
 * `null` when the step's prerequisites are satisfied. Only "provider" and
 * "credential" gate forward progress — every later step's own inputs are
 * optional or carry a sensible default.
 */
export function getStepBlockReason(stepId: SyncConfigStepId, ctx: StepGateContext): string | null {
    if (stepId === "provider" && !ctx.name.trim()) {
        return "Enter a configuration name to continue.";
    }
    if (stepId === "credential" && !ctx.credentialId) {
        return "Select a credential to continue — repository and dataset options depend on it.";
    }
    return null;
}

export type RepoSelectionGateContext = {
    credentialId: string;
    owner: string;
    syncAllRepos: boolean;
};

/**
 * Returns a user-facing reason repository selection (the RepoSelector
 * browse/pick list) is unavailable, or `null` when it's ready to use. Never
 * blocks when "sync all repositories" is on, since no per-repo picking is
 * needed in that mode.
 */
export function getRepoSelectionBlockReason(ctx: RepoSelectionGateContext): string | null {
    if (ctx.syncAllRepos) return null;
    if (!ctx.credentialId) {
        return "Select a credential on the previous step before choosing repositories.";
    }
    if (!ctx.owner.trim()) {
        return "Enter an owner or organization above to browse and select repositories.";
    }
    return null;
}
