/**
 * ACR canonical subject ids for the entities a page proposes as Ask Dev context (CHAOS-11938).
 *
 * ACR commits a page hint on the caller's identity only when its `id` is ACR's exact canonical id:
 * any other id misses the exact lookup and the hint falls back to a statistical match on its label
 * (executed against a real FalkorDB, recorded on CHAOS-12230). So a page states its entities in
 * ACR's id grammar, built from the natural keys ops serves:
 *
 * - organization: `organization:<org id>` (ACR `devhealthsource/clickhouse.go`)
 * - repository: `repository:<repos.id>` (`repositoryCanonicalID`)
 * - team: `team:<teams.id>` (`contextfabric.TeamCanonicalID`)
 * - pull request: `pull_request:<repo id>:<number>` (`pullRequestCanonicalID`)
 *
 * Pinned to the canonical-id vectors ACR generates by executing its own builders (acr #1827,
 * CHAOS-12230), vendored at the web pin (`src/lib/acr/contracts/examples/
 * context_fabric_canonical_id_vectors.v1.json`; CHAOS-12280): every vector of these kinds builds its
 * id byte for byte. A new builder here must be checked against them too.
 * A building block only: the registry (`page-context.ts`) still bounds and filters what is sent.
 */

const part = (value: string | null | undefined): string | null => {
    const trimmed = value?.trim() ?? "";
    return trimmed === "" ? null : trimmed;
};

export const SUBJECT_ID = {
    organization: (orgId: string | null | undefined): string | null => {
        const id = part(orgId);
        return id === null ? null : `organization:${id}`;
    },
    repository: (repoId: string | null | undefined): string | null => {
        const id = part(repoId);
        return id === null ? null : `repository:${id}`;
    },
    team: (teamId: string | null | undefined): string | null => {
        const id = part(teamId);
        return id === null ? null : `team:${id}`;
    },
    pullRequest: (repoId: string | null | undefined, number: number): string | null => {
        const repo = part(repoId);
        return repo === null || !Number.isSafeInteger(number) || number <= 0
            ? null
            : `pull_request:${repo}:${String(number)}`;
    },
} as const;
