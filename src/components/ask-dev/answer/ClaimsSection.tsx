"use client";

import type { DevAnswer } from "@/lib/dev/generated";
import { formatPercent } from "@/lib/formatters";

import { InlineCitations, type CitationTargets } from "./InlineCitations";
import { validityScopeLabel, type SafeProse } from "./labels";

/**
 * The claim list ("What the evidence suggests").
 *
 * Claim text is model-authored, so it goes through `safeProse` exactly as
 * `direct_summary` does. Whether the section renders at all is the container's
 * call: CHAOS-3377 HIGH withholds a refused-with-grounding row's claims
 * entirely rather than showing them under a relabeled status.
 */
export function ClaimsSection({
    claims,
    headingId,
    safeProse,
    targets,
}: {
    claims: NonNullable<DevAnswer["claims"]>;
    headingId: string;
    safeProse: SafeProse;
    targets: CitationTargets;
}) {
    return (
        <section className="space-y-3 border-t border-(--border) pt-4" aria-labelledby={headingId}>
            <h3 id={headingId} className="text-label-caps text-(--text-muted)">
                What the evidence suggests
            </h3>
            <ul className="space-y-3">
                {claims.map((claim) => (
                    <li key={claim.claim_id} className="flex gap-3 text-sm leading-6">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-(--accent)" />
                        <div className="min-w-0">
                            <p>
                                {safeProse(claim.text)}
                                <InlineCitations
                                    evidenceRefIds={claim.evidence_ref_ids}
                                    metricRefIds={claim.metric_ref_ids}
                                    ownerLabel="claim"
                                    targets={targets}
                                />
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-(--text-muted)">
                                <span>
                                    {claim.kind.replaceAll("_", " ")} ·{" "}
                                    {formatPercent(claim.confidence * 100)} confidence
                                </span>
                                {validityScopeLabel(claim.validity_scope) ? (
                                    <span>
                                        Applies to {validityScopeLabel(claim.validity_scope)}
                                    </span>
                                ) : null}
                                {claim.flags.stale ? (
                                    <span className="rounded-(--radius-pill) bg-(--caution)/10 px-2 text-(--caution)">
                                        Stale
                                    </span>
                                ) : null}
                                {claim.flags.uncertain ? (
                                    <span className="rounded-(--radius-pill) bg-(--caution)/10 px-2 text-(--caution)">
                                        Uncertain
                                    </span>
                                ) : null}
                                {claim.flags.conflicting ? (
                                    <span className="rounded-(--radius-pill) bg-(--caution)/10 px-2 text-(--caution)">
                                        Conflicting
                                    </span>
                                ) : null}
                                {claim.flags.untrusted_source ? (
                                    <span className="rounded-(--radius-pill) bg-(--negative)/10 px-2 text-(--negative)">
                                        Untrusted source
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
}
