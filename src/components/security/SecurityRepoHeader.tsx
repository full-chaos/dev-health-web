"use client";

import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBarFrame } from "@/components/shell/ScopeBarFrame";
import { useSecurityAlerts } from "@/lib/graphql/hooks/useSecurity";
import type { SecurityFilter } from "@/lib/filters/security";

type SecurityRepoHeaderProps = {
    repoId: string;
    /** The filter of the queue, already locked to `repoId`. */
    filter: SecurityFilter;
};

/**
 * Header and scope bar of the repository page. The title is the repository
 * name, read from the alert rows (they carry `repoName`); the id is the
 * fallback and is never blank. The repository control is locked by the route.
 *
 * Same query and variables as the queue below, so the request is shared.
 */
export function SecurityRepoHeader({ repoId, filter }: SecurityRepoHeaderProps) {
    const { allEdges } = useSecurityAlerts(filter);
    const name = allEdges.find((edge) => edge.node.repoId === repoId)?.node.repoName?.trim();
    const title = name || repoId;

    return (
        <>
            <PageHeader
                title={title}
                subtitle="Security alerts scoped to this repository."
                back={{ href: "/security", area: "Security" }}
            />
            <div title={name ? `Repository id: ${repoId}` : undefined}>
                <ScopeBarFrame
                    view="security-repo"
                    repos={{
                        options: [{ id: repoId, label: title }],
                        selected: [repoId],
                        onChange: () => {},
                        locked: true,
                    }}
                    onReset={() => {}}
                />
            </div>
        </>
    );
}
