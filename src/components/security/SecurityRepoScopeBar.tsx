"use client";

import { ScopeBarFrame } from "@/components/shell/ScopeBarFrame";

/**
 * Scope bar of the repository page: the repository is fixed by the route, so
 * its control is locked and shows the repository name (the id when no name is
 * known; never blank). Reset has nothing to reset here.
 */
export function SecurityRepoScopeBar({ repoId, name }: { repoId: string; name?: string }) {
    const label = name || repoId;

    return (
        <div title={name ? `Repository id: ${repoId}` : undefined}>
            <ScopeBarFrame
                view="security-repo"
                repos={{
                    options: [{ id: repoId, label }],
                    selected: [repoId],
                    onChange: () => {},
                    locked: true,
                }}
                onReset={() => {}}
            />
        </div>
    );
}
