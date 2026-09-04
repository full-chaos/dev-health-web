/**
 * Pure form-state diffing for the sync config edit form (CHAOS-2797).
 *
 * All bookkeeping here derives from client-side form state vs the values the
 * form was seeded with (never from server inference) — the diff summary and
 * destructive-change warnings shown to the user are built exclusively from
 * what the user actually changed in this session.
 */
import { DATASET_LABELS, formatDepthLabel, formatScheduleLabel } from "./constants";

export type SyncFormSnapshot = {
    sync_targets: string[];
    is_active: boolean;
    schedule_cron: string | null;
    timezone: string | null;
    initial_sync_depth: number | null;
    owner: string;
    gitlab_url: string;
    auto_import_teams: boolean;
    auto_import_projects: boolean;
    auto_import_members: boolean;
    repos: string[];
    syncAllRepos: boolean;
};

function diffIds(baseline: string[], current: string[]) {
    const currentSet = new Set(current);
    const baselineSet = new Set(baseline);
    return {
        added: current.filter((id) => !baselineSet.has(id)),
        removed: baseline.filter((id) => !currentSet.has(id)),
    };
}

/** Dataset ids present in the baseline but no longer selected. */
export function getRemovedDatasets(
    baseline: SyncFormSnapshot,
    current: SyncFormSnapshot,
): string[] {
    return diffIds(baseline.sync_targets, current.sync_targets).removed;
}

/** Repos present in the baseline selection but no longer selected. */
export function getRemovedRepos(baseline: SyncFormSnapshot, current: SyncFormSnapshot): string[] {
    return diffIds(baseline.repos, current.repos).removed;
}

const MAX_LISTED_REPOS = 5;

function formatRepoList(repos: string[]): string {
    if (repos.length <= MAX_LISTED_REPOS) return repos.join(", ");
    const shown = repos.slice(0, MAX_LISTED_REPOS).join(", ");
    return `${shown}, and ${repos.length - MAX_LISTED_REPOS} more`;
}

/**
 * Human-readable warnings for changes that reduce sync coverage: dropping
 * "sync all repositories", removing individually-selected repos, or removing
 * datasets/sync targets. Empty array means nothing destructive is staged.
 */
export function getRepoScopeWarnings(
    baseline: SyncFormSnapshot,
    current: SyncFormSnapshot,
): string[] {
    const warnings: string[] = [];

    if (baseline.syncAllRepos && !current.syncAllRepos) {
        warnings.push(
            "Turning off \u201Csync all repositories\u201D will stop syncing any repository outside your new selection.",
        );
    }

    if (!current.syncAllRepos) {
        const removedRepos = getRemovedRepos(baseline, current);
        if (removedRepos.length > 0) {
            warnings.push(
                `Removing ${removedRepos.length} repositor${removedRepos.length === 1 ? "y" : "ies"} from scope: ${formatRepoList(removedRepos)}. New data for these will stop syncing.`,
            );
        }
    }

    return warnings;
}

/** Human-readable warning for dataset/sync-target removal (CHAOS-2797). */
export function getDatasetWarnings(
    baseline: SyncFormSnapshot,
    current: SyncFormSnapshot,
): string[] {
    const removedDatasets = getRemovedDatasets(baseline, current);
    if (removedDatasets.length === 0) return [];

    const labels = removedDatasets.map((id) => DATASET_LABELS[id] ?? id);
    return [
        `Removing dataset${labels.length === 1 ? "" : "s"}: ${labels.join(", ")}. Already-synced data is kept, but new data for ${labels.length === 1 ? "it" : "them"} will stop syncing.`,
    ];
}

/**
 * Human-readable summary of every field that changed between the baseline
 * (values the form was seeded with) and the current form state, for the
 * post-save "what changed" confirmation.
 */
export function buildChangeSummary(
    baseline: SyncFormSnapshot,
    current: SyncFormSnapshot,
): string[] {
    const changes: string[] = [];

    const { added: addedDatasets, removed: removedDatasets } = diffIds(
        baseline.sync_targets,
        current.sync_targets,
    );
    if (addedDatasets.length > 0 || removedDatasets.length > 0) {
        const parts: string[] = [];
        if (addedDatasets.length > 0) {
            parts.push(`+${addedDatasets.map((id) => DATASET_LABELS[id] ?? id).join(", ")}`);
        }
        if (removedDatasets.length > 0) {
            parts.push(`-${removedDatasets.map((id) => DATASET_LABELS[id] ?? id).join(", ")}`);
        }
        changes.push(`Datasets: ${parts.join(" ")}`);
    }

    if (baseline.is_active !== current.is_active) {
        changes.push(`Schedule: ${current.is_active ? "enabled" : "disabled"}`);
    }

    if (
        baseline.schedule_cron !== current.schedule_cron ||
        baseline.timezone !== current.timezone
    ) {
        changes.push(
            `Schedule: ${formatScheduleLabel(baseline.schedule_cron)} \u2192 ${formatScheduleLabel(current.schedule_cron)}`,
        );
    }

    if (baseline.initial_sync_depth !== current.initial_sync_depth) {
        changes.push(
            `Initial depth: ${formatDepthLabel(baseline.initial_sync_depth)} \u2192 ${formatDepthLabel(current.initial_sync_depth)}`,
        );
    }

    if (baseline.owner !== current.owner) {
        changes.push(`Owner: ${baseline.owner || "(none)"} \u2192 ${current.owner || "(none)"}`);
    }

    if (baseline.gitlab_url !== current.gitlab_url) {
        changes.push("GitLab URL updated");
    }

    if (baseline.auto_import_teams !== current.auto_import_teams) {
        changes.push(`Import teams: ${current.auto_import_teams ? "enabled" : "disabled"}`);
    }
    if (baseline.auto_import_projects !== current.auto_import_projects) {
        changes.push(`Import projects: ${current.auto_import_projects ? "enabled" : "disabled"}`);
    }
    if (baseline.auto_import_members !== current.auto_import_members) {
        changes.push(`Import members: ${current.auto_import_members ? "enabled" : "disabled"}`);
    }

    if (baseline.syncAllRepos !== current.syncAllRepos) {
        changes.push(`Sync all repositories: ${current.syncAllRepos ? "enabled" : "disabled"}`);
    }

    if (!current.syncAllRepos) {
        const { added: addedRepos, removed: removedRepos } = diffIds(baseline.repos, current.repos);
        if (addedRepos.length > 0 || removedRepos.length > 0) {
            const parts: string[] = [];
            if (addedRepos.length > 0) parts.push(`+${addedRepos.length}`);
            if (removedRepos.length > 0) parts.push(`-${removedRepos.length}`);
            changes.push(`Repositories: ${parts.join(" ")}`);
        }
    }

    return changes;
}
