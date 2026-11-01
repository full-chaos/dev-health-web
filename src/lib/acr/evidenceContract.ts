/**
 * The check of the ACR expanded evidence body in the browser (CHAOS-12105).
 *
 * The browser reads `/api/v1/agent-context/evidence/{ref}` directly, and checks each body against
 * `expanded_evidence.v1` before it is mapped. As for the thread and feedback bodies, the check is
 * Ajv standalone code generated from the vendored schema (`threadValidators.js`,
 * `scripts/acr-contract-artifacts.mjs`): no eval at runtime, no hand-written second implementation,
 * and `pnpm acr:contracts:check` fails on any drift.
 *
 * This module only MAPS a body that passed to the view the drawer reads.
 *
 * Do not import `ajv` or `@/lib/acr/contracts` here: both would put the runtime Ajv in the browser.
 */
import type { EvidenceView } from "@/components/ask-dev/conversation/transport";

import type { ACRExpandedEvidenceV1 } from "./generated";
import { validateExpandedEvidence } from "./threadValidators";

/** The view of an `expanded_evidence.v1` body, or `null` when it breaks the contract. */
export function parseExpandedEvidence(body: unknown): EvidenceView | null {
    if (!validateExpandedEvidence(body)) return null;
    const expanded = body as ACRExpandedEvidenceV1;
    return {
        refId: expanded.evidence.evidence_ref_id,
        citation: expanded.evidence.citation,
        observedAt: expanded.evidence.observed_at,
        availability: expanded.availability,
        structuredFields: expanded.structured_fields,
        ...(expanded.excerpt === undefined ? {} : { excerpt: expanded.excerpt }),
        ...(expanded.redaction_reason === undefined
            ? {}
            : { redactionReason: expanded.redaction_reason }),
    };
}
