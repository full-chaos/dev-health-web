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
 * - work item: `work_item.v2:<repo id>:<work_item_id>`, each segment escaped (`%` as `%25`, `:` as
 *   `%3A`, acr `identity.JoinSegments`), and none over ACR's 256 bytes (CHAOS-12240)
 *
 * Pinned to the canonical-id vectors ACR generates by executing its own builders (acr #1827,
 * CHAOS-12230), vendored at the web pin (`src/lib/acr/contracts/examples/
 * context_fabric_canonical_id_vectors.v1.json`; CHAOS-12280): every vector of these kinds builds its
 * id byte for byte. A new builder here must be checked against them too.
 * A building block only: the registry (`page-context.ts`) still bounds and filters what is sent.
 */

/**
 * ACR's bound on a canonical id, in UTF-8 BYTES (acr `identity.MaxNaturalKeyBytes`): ACR omits a
 * longer one (the vectors' `omitted`). A count of characters would let a non-ASCII id through that
 * ACR never mints (codex r1 P2 on #1742).
 */
const MAX_CANONICAL_ID_BYTES = 256;
const utf8Bytes = (value: string): number => new TextEncoder().encode(value).length;

/** acr `identity.JoinSegments`: `%` first, so an escape is never escaped twice. */
const escapeSegment = (value: string): string =>
    value.replaceAll("%", "%25").replaceAll(":", "%3A");

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
    /**
     * A work item's id keeps the served value as it is: it is an identity, so it is never trimmed.
     * ACR omits an id past its bound rather than cut it, and so does this.
     */
    workItem: (
        repoId: string | null | undefined,
        workItemId: string | null | undefined,
    ): string | null => {
        const repo = part(repoId);
        if (repo === null || workItemId === null || workItemId === undefined) return null;
        if (workItemId.trim() === "") return null;
        const id = `work_item.v2:${escapeSegment(repo)}:${escapeSegment(workItemId)}`;
        return utf8Bytes(id) > MAX_CANONICAL_ID_BYTES ? null : id;
    },
    pullRequest: (repoId: string | null | undefined, number: number): string | null => {
        const repo = part(repoId);
        return repo === null || !Number.isSafeInteger(number) || number <= 0
            ? null
            : `pull_request:${repo}:${String(number)}`;
    },
} as const;
