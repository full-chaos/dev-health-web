"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { SkeletonLine } from "@/components/ui/Skeleton";
import { listReposForCredential } from "@/lib/admin/server";
import type { DiscoveredRepo } from "@/lib/admin/types";

export type RepoSelectorProps = {
  credentialId: string;
  owner: string;
  selectedRepos: string[];
  onSelectionChange: (repos: string[]) => void;
  maxRepos?: number;
};

type FetchState = {
  repos: DiscoveredRepo[];
  loading: boolean;
  error: string | null;
};

type FetchAction =
  | { type: "start" }
  | { type: "success"; repos: DiscoveredRepo[] }
  | { type: "error"; error: string }
  | { type: "reset" };

function fetchReducer(_state: FetchState, action: FetchAction): FetchState {
  switch (action.type) {
    case "start":
      return { repos: [], loading: true, error: null };
    case "success":
      return { repos: action.repos, loading: false, error: null };
    case "error":
      return { repos: [], loading: false, error: action.error };
    case "reset":
      return { repos: [], loading: false, error: null };
  }
}

export function RepoSelector({
  credentialId,
  owner,
  selectedRepos,
  onSelectionChange,
  maxRepos,
}: RepoSelectorProps) {
  const [state, dispatch] = useReducer(fetchReducer, {
    repos: [],
    loading: false,
    error: null,
  });
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
        dispatch({ type: "success", repos: result.data?.repos ?? [] });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [credentialId, owner]);

  const { repos, loading, error } = state;

  const filteredRepos = repos.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));

  const handleToggle = useCallback(
    (repoName: string, checked: boolean) => {
      if (checked) {
        if (maxRepos !== undefined && selectedRepos.length >= maxRepos) return;
        onSelectionChange([...selectedRepos, repoName]);
      } else {
        onSelectionChange(selectedRepos.filter((r) => r !== repoName));
      }
    },
    [selectedRepos, onSelectionChange, maxRepos],
  );

  const handleSelectAll = useCallback(() => {
    const names = filteredRepos.map((r) => r.name);
    const next = maxRepos !== undefined ? names.slice(0, maxRepos) : names;
    onSelectionChange(next);
  }, [filteredRepos, maxRepos, onSelectionChange]);

  const handleClear = useCallback(() => {
    onSelectionChange([]);
  }, [onSelectionChange]);

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
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">
        Failed to load repositories: {error}
      </div>
    );
  }

  if (repos.length === 0) {
    return (
      <p className="text-xs text-(--ink-muted)">
        No repositories found for <strong>{owner}</strong> using the selected credential.
      </p>
    );
  }

  const atLimit = maxRepos !== undefined && selectedRepos.length >= maxRepos;

  return (
    <div className="space-y-3">
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
            Select All
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="rounded-md border border-(--card-stroke) px-2 py-1 text-xs font-medium text-(--foreground) hover:bg-(--card-70)"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search repositories..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
      />

      {/* Repo list */}
      <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
        {filteredRepos.length === 0 ? (
          <p className="text-xs text-(--ink-muted)">No repositories match your search.</p>
        ) : (
          filteredRepos.map((repo) => {
            const isChecked = selectedRepos.includes(repo.name);
            const isDisabled = !isChecked && atLimit;
            return (
              <label
                key={repo.name}
                className={`flex items-center gap-2 rounded-lg border border-(--card-stroke) bg-(--card-70) p-3 hover:bg-(--card-60) ${
                  isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={isDisabled}
                  onChange={(e) => handleToggle(repo.name, e.target.checked)}
                  className="h-4 w-4 rounded border-(--card-stroke) bg-(--card-80) text-(--accent) focus:ring-(--accent)"
                />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{repo.name}</span>
                  {repo.description && (
                    <span className="block truncate text-xs text-(--ink-muted)">
                      {repo.description}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-(--ink-muted)">
                  {repo.language && <span>{repo.language}</span>}
                  {repo.is_private && (
                    <span className="rounded-full border border-(--card-stroke) px-1.5 py-0.5 text-[10px]">
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
