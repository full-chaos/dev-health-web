"use client";

import { ScopeBarFrame } from "@/components/shell/ScopeBarFrame";

/**
 * Scope bar of the repository page: the repository is fixed by the route, so
 * its control is locked and shows the repository name ("Repository" when no
 * name is known; the id is not shown). Reset has nothing to reset here.
 */
export function SecurityRepoScopeBar({ repoId, name }: { repoId: string; name?: string }) {
    const label = name || "Repository";

    return (
        <div>
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
