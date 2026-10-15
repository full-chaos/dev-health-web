"use client";

import { READ_FAILED_MESSAGE } from "@/lib/readFailure";
import { useCallback, useEffect, useReducer, useState } from "react";
import { SkeletonLine } from "@/components/ui/Skeleton";
import { listReposForCredential } from "@/lib/admin/server";
import type { DiscoveredRepo } from "@/lib/admin/types";
import { CTA_LABELS } from "@/lib/design/cta";
import { Notice } from "@/components/ui/Notice";

export type RepoSelectorProps = {
    credentialId: string;
    owner: string;
    selectedRepos: string[];
    onSelectionChangeAction: (repos: string[]) => void;
    maxRepos?: number;
};

type FetchState = {
    repos: DiscoveredRepo[];
    loading: boolean;
    error: string | null;
    installationScoped: boolean;
    ownerNotFound: boolean;
};

type FetchAction =
    | { type: "start" }
    | {
          type: "success";
          repos: DiscoveredRepo[];
          installationScoped: boolean;
          ownerNotFound: boolean;
      }
    | { type: "error"; error: string }
    | { type: "reset" };

const EMPTY_STATE: FetchState = {
    repos: [],
    loading: false,
    error: null,
    installationScoped: false,
    ownerNotFound: false,
};

function fetchReducer(_state: FetchState, action: FetchAction): FetchState {
    switch (action.type) {
        case "start":
            return { ...EMPTY_STATE, loading: true };
        case "success":
            return {
                repos: action.repos,
                loading: false,
                error: null,
                installationScoped: action.installationScoped,
                ownerNotFound: action.ownerNotFound,
            };
        case "error":
            return { ...EMPTY_STATE, error: action.error };
        case "reset":
            return EMPTY_STATE;
    }
}

function InstallationScopeNotice() {
    return (
        <Notice variant="info">
            This list shows only the repositories that the GitHub App installation can access. To
            see more, change the installation&apos;s repository access in GitHub.
        </Notice>
    );
}

export function RepoSelector({
    credentialId,
    owner,
    selectedRepos,
    onSelectionChangeAction,
    maxRepos,
}: RepoSelectorProps) {
    const [state, dispatch] = useReducer(fetchReducer, EMPTY_STATE);
    const [search, setSearch] = useState("");

    useEffect(() => {
        if (!credentialId || !owner) {
            dispatch({ type: "reset" });
            return;
        }

        let cancelled = false;
        dispatch({ type: "start" });

        listReposForCredential(credentialId, owner).then((result) => {
            if (cancelled) return;
            if (result.error) {
                dispatch({ type: "error", error: result.error });
            } else {
                dispatch({
                    type: "success",
                    repos: result.data?.repos ?? [],
                    installationScoped: result.data?.installation_scoped === true,
                    ownerNotFound: result.data?.diagnostic === "owner_not_found",
                });
            }
        });

        return () => {
            cancelled = true;
        };
    }, [credentialId, owner]);

    const { repos, loading, error, installationScoped, ownerNotFound } = state;

    const filteredRepos = repos.filter((repo) => {
        const query = search.toLowerCase();
        return (
            repo.name.toLowerCase().includes(query) || repo.full_name.toLowerCase().includes(query)
        );
    });

    const handleToggle = useCallback(
        (repoFullName: string, checked: boolean) => {
            if (checked) {
                if (maxRepos !== undefined && selectedRepos.length >= maxRepos) return;
                onSelectionChangeAction([...selectedRepos, repoFullName]);
            } else {
                onSelectionChangeAction(selectedRepos.filter((r) => r !== repoFullName));
            }
        },
        [selectedRepos, onSelectionChangeAction, maxRepos],
    );

    const handleSelectAll = useCallback(() => {
        const fullNames = filteredRepos.map((repo) => repo.full_name);
        const next = maxRepos !== undefined ? fullNames.slice(0, maxRepos) : fullNames;
        onSelectionChangeAction(next);
    }, [filteredRepos, maxRepos, onSelectionChangeAction]);

    const handleClear = useCallback(() => {
        onSelectionChangeAction([]);
    }, [onSelectionChangeAction]);

    // Not ready to show — need both inputs
    if (!credentialId || !owner) {
        return (
            <p className="text-xs text-(--ink-muted)">
                Select a credential and enter an owner to browse repositories.
            </p>
        );
    }

    if (loading) {
        return (
            <div className="space-y-2">
                {Array.from({ length: 5 }, (_, i) => (
                    <SkeletonLine key={`repo-skeleton-${i}`} height="h-10" />
                ))}
            </div>
        );
    }

    if (error) {
        return <Notice variant="danger">Failed to load repositories. {READ_FAILED_MESSAGE}</Notice>;
    }

    if (ownerNotFound && repos.length === 0) {
        return (
            <Notice variant="warn">
                Owner <strong>{owner}</strong> was not found. Check the spelling of the organization
                or user name.
            </Notice>
        );
    }

    if (repos.length === 0) {
        return (
            <div className="space-y-2">
                <p className="text-xs text-(--ink-muted)">
                    No repositories found for <strong>{owner}</strong> using the selected
                    credential.
                </p>
                {installationScoped && <InstallationScopeNotice />}
            </div>
        );
    }

    const atLimit = maxRepos !== undefined && selectedRepos.length >= maxRepos;

    return (
        <div className="space-y-3">
            {installationScoped && <InstallationScopeNotice />}
            {/* Counter + actions */}
            <div className="flex items-center justify-between">
                <span className="text-xs text-(--ink-muted)">
                    {selectedRepos.length} of {repos.length} selected
                    {maxRepos !== undefined && ` (limit: ${maxRepos})`}
                </span>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleSelectAll}
                        className="rounded-md border border-(--card-stroke) px-2 py-1 text-xs font-medium text-(--foreground) hover:bg-(--card-70)"
                    >
                        {CTA_LABELS.selectAll}
                    </button>
                    <button
                        type="button"
                        onClick={handleClear}
                        className="rounded-md border border-(--card-stroke) px-2 py-1 text-xs font-medium text-(--foreground) hover:bg-(--card-70)"
                    >
                        {CTA_LABELS.clear}
                    </button>
                </div>
            </div>

            {/* Search */}
            <input
                type="text"
                placeholder="Search repositories..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent-2) focus:outline-none focus:ring-1 focus:ring-(--accent-2)"
            />

            {/* Repo list */}
            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                {filteredRepos.length === 0 ? (
                    <p className="text-xs text-(--ink-muted)">No repositories match your search.</p>
                ) : (
                    filteredRepos.map((repo) => {
                        const isChecked = selectedRepos.includes(repo.full_name);
                        const isDisabled = !isChecked && atLimit;
                        return (
                            <label
                                key={repo.full_name}
                                className={`flex items-center gap-2 rounded-lg border border-(--card-stroke) bg-(--card-70) p-3 hover:bg-(--card-60) ${
                                    isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={isChecked}
                                    disabled={isDisabled}
                                    onChange={(e) => handleToggle(repo.full_name, e.target.checked)}
                                    className="h-4 w-4 rounded border-(--card-stroke) bg-(--card-80) text-(--accent) focus:ring-(--accent-2)"
                                />
                                <div className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium">
                                        {repo.name}
                                    </span>
                                    {repo.description && (
                                        <span className="block truncate text-xs text-(--ink-muted)">
                                            {repo.description}
                                        </span>
                                    )}
                                </div>
                                <div className="flex shrink-0 items-center gap-2 text-xs text-(--ink-muted)">
                                    {repo.language && <span>{repo.language}</span>}
                                    {repo.is_private && (
                                        <span className="rounded-full border border-(--card-stroke) px-1.5 py-0.5 text-label-caps">
                                            private
                                        </span>
                                    )}
                                </div>
                            </label>
                        );
                    })
                )}
            </div>
        </div>
    );
}
