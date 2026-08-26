"use client";

import { CTA_LABELS } from "@/lib/design/cta";
import type { DevAnswer, DevScope } from "@/lib/dev/generated";

import { scopeCoverageLabel } from "./labels";

/**
 * The entity-ref shape a candidate carries, derived from the scope contract
 * rather than named directly — the generated module exposes `DevEntityRef`
 * only inside positional tuple types. Structurally identical to
 * `AskDevProvider`'s own private alias, so `selectProposedEntity` accepts one
 * of these unchanged.
 */
type ScopeEntityRef = NonNullable<DevScope["entity_refs"]>[number];

/**
 * The resolved-scope row and, when the resolver returned any, the candidate
 * list.
 *
 * `outcomeLabel` is resolved by the container rather than looked up here: a
 * legacy row whose prose contradicts its own outcome has its outcome value
 * WITHHELD (replaced with the collapsed no-authorized-match label), and that
 * judgement belongs beside the predicate that makes it.
 *
 * Selecting a candidate proposes it as context — it never submits. CHAOS-3665
 * and the PRD both forbid auto-selecting the first result, so this list has no
 * default, no preselection, and no implicit commit.
 */
export function ScopeSection({
    noMatch,
    onSelectCandidate,
    outcomeLabel,
    scopeResolution,
}: {
    noMatch: boolean;
    /**
     * CHAOS-3478: `candidates` is threaded alongside the picked entity so
     * the provider can bind the selection to the exact list this section
     * rendered it from, rather than trusting an isolated ref.
     */
    onSelectCandidate: (entityRef: ScopeEntityRef, candidates: readonly ScopeEntityRef[]) => void;
    outcomeLabel: string;
    scopeResolution: NonNullable<DevAnswer["resolved_scope"]>;
}) {
    const candidateEntityRefs =
        scopeResolution.candidates?.map((candidate) => candidate.entity_ref) ?? [];
    return (
        <section className="border-y border-(--border) py-3" aria-label="Resolved answer scope">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-(--text-muted)">
                    Scope outcome:{" "}
                    <strong className="font-medium text-(--text-secondary)">{outcomeLabel}</strong>
                </span>
                <span className="text-(--text-muted)">{scopeCoverageLabel(scopeResolution)}</span>
            </div>
            {scopeResolution.candidates?.length ? (
                <div className="mt-3">
                    {/*
                     * Two different situations share this list.
                     * Ambiguity means several authorized entities DID
                     * match and one must be picked; a no-match means
                     * none did and these are only the nearest names
                     * (CHAOS-3366 fills them; empty today). Calling
                     * the second "possible scope matches" would assert
                     * the subject exists, which is the substitution
                     * §12 prohibits.
                     */}
                    <p className="text-label-caps text-(--caution)">
                        {noMatch ? "Closest matches" : "Possible scope matches"}
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-(--text-secondary)">
                        {scopeResolution.candidates.map((candidate) => (
                            <li
                                key={`${candidate.entity_ref.entity_type}:${candidate.entity_ref.entity_id}`}
                                className="flex flex-wrap items-center justify-between gap-2"
                            >
                                <span>
                                    {candidate.entity_ref.display_label} — {candidate.reason}
                                </span>
                                <button
                                    type="button"
                                    onClick={() =>
                                        onSelectCandidate(candidate.entity_ref, candidateEntityRefs)
                                    }
                                    className="rounded-(--radius-sm) border border-(--border) px-2 py-1 text-xs font-medium hover:border-(--accent)/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45"
                                >
                                    {CTA_LABELS.useAskDevScope}
                                </button>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-2 text-xs text-(--text-muted)">
                        {noMatch
                            ? "None of these is the subject you named. Pick one to ask about it instead."
                            : "Choose or remove the proposed context before asking the next question."}
                    </p>
                </div>
            ) : null}
        </section>
    );
}
