import type { DevAnswer, DevScope } from "@/lib/dev/generated";

/**
 * Strip the UNTRUSTED_DATA fence the evidence service wraps a fetched excerpt
 * in. The fence is a prompt-injection boundary for the model, not copy for a
 * human, so it is removed at the last layer before display — the excerpt
 * inside stays untrusted either way and is never interpreted, only shown.
 */
export function safeExcerpt(value: string | null | undefined): string | null {
    if (!value) return null;
    return value.replace(/^UNTRUSTED_DATA\r?\n/u, "").replace(/\r?\nEND_UNTRUSTED_DATA$/u, "");
}

/**
 * Name the subject a scope applies to, rather than counting anonymous ids.
 *
 * Prefers the entity whose type matches the scope's own `direct_scope` — that
 * is the named subject the reader asked about. Falls back to a counted label
 * ("3 repositories") only when no such entity is on the wire, which keeps the
 * row honest for a scope that genuinely commits to a set rather than one
 * subject.
 */
export function validityScopeLabel(scope: DevScope | null | undefined): string | null {
    if (!scope) return null;
    const namedEntity = scope.entity_refs?.find(
        (entity) => entity.entity_type === scope.direct_scope,
    );
    if (namedEntity) return namedEntity.display_label;
    if (scope.direct_scope === "organization") return "Organization";
    const count =
        scope.direct_scope === "repository"
            ? (scope.repositories?.length ?? 0)
            : (scope.entity_refs?.filter((entity) => entity.entity_type === scope.direct_scope)
                  .length ?? 0);
    const label = scope.direct_scope.replaceAll("_", " ");
    return count > 0 ? `${count} ${label}${count === 1 ? "" : "s"}` : label;
}

/**
 * The scope-outcome row's secondary line (CHAOS-3377 defect 4).
 *
 * Previously always rendered "{authorized_repository_ids.length} authorized
 * repositories", regardless of the resolved scope's own kind -- correct for
 * a REPOSITORY-scoped answer, but for a PROJECT (or any other non-repository)
 * scope the repository count is at best incidental and at worst reads as
 * "0 authorized repositories" for a subject that has real, substantive
 * content and simply carries no repository dimension on the wire (see
 * ops's `ScopeResolutionService`/`DevScope.repositories`, which is only
 * ever populated for a REPOSITORY commit). Reuses `validityScopeLabel` --
 * the same "name the subject, not a count" logic `claim.validity_scope`
 * already renders -- so a project scope shows its subject ("Falcon Nine")
 * instead. Falls back to the repository count whenever the scope itself is
 * missing or genuinely repository-scoped, which is unchanged behavior.
 */
export function scopeCoverageLabel(
    scopeResolution: NonNullable<DevAnswer["resolved_scope"]>,
): string {
    const scope = scopeResolution.resolved_scope ?? scopeResolution.requested_scope;
    if (scope && scope.direct_scope !== "repository") {
        const subjectLabel = validityScopeLabel(scope);
        if (subjectLabel) return subjectLabel;
    }
    const count = scopeResolution.authorized_repository_ids?.length ?? 0;
    return `${count} authorized repositories`;
}

/**
 * A prose sanitizer with its denylist and attested-string set already bound.
 *
 * Every section component that renders model-authored prose takes one of
 * these rather than importing the denylist itself. Two reasons, both
 * load-bearing: the denylist is derived from the TOTAL label maps that live
 * in `AskDevAnswer.tsx` (importing it back from a section would be a cycle),
 * and a section that must be *handed* its sanitizer cannot silently forget to
 * apply one the way a section that constructs its own arguments can.
 */
export type SafeProse = (value: string | null | undefined) => string;
