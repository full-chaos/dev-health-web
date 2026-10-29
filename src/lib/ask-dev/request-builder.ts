import type {
    ACRContextFabricInvestigationRequestV1 as InvestigationRequest,
    ConversationTurn,
    SubjectHint,
} from "@/lib/acr/generated";
import { MAX_CONVERSATION_TURNS_ON_WIRE, MAX_SUBJECT_HINTS_ON_WIRE } from "./conversation";

/**
 * The Ask Dev investigation request builder, ported from the ask-dev repo's
 * `buildInvestigationRequest` (`src/lib/acr/client.ts`). The differential test holds the two
 * byte-equal for the same inputs and the same injected `request_id`.
 *
 * Authorization is NOT an input. The builder takes no org, principal, scope, token or assertion,
 * and builds the wire object field by field (never by spreading its input), so client state
 * cannot smuggle one in. The server route reads all of them fresh on every call.
 *
 * Web-only metadata (`consumer`) is a separate argument, not part of the shared inputs.
 */

/** A receipt ACR issued on a prior result. The caller hands it back; it never re-types a subject. */
export type BoundReceipt = {
    readonly result_id: string;
    readonly receipt_id: string;
};

/** The five `prior_*_receipts` structure fields; each holds at most 20 receipts on the wire. */
export type StructureReceipts = {
    readonly priorKindReceipts?: readonly BoundReceipt[] | undefined;
    readonly priorAnchorReceipts?: readonly BoundReceipt[] | undefined;
    readonly priorHandleReceipts?: readonly BoundReceipt[] | undefined;
    readonly priorWindowReceipts?: readonly BoundReceipt[] | undefined;
    readonly priorCandidateReceipts?: readonly BoundReceipt[] | undefined;
};

export type ExpectedKind = NonNullable<InvestigationRequest["expected_kinds"]>[number];

export type ConsumerInfo = {
    readonly name: string;
    readonly version: string;
    readonly surface: string;
};

/** Web-only metadata, kept apart from the shared request inputs. */
export const WEB_CONSUMER: ConsumerInfo = {
    name: "dev-health-web",
    version: "0.1.0",
    surface: "web",
};

export type InvestigationRequestInput = {
    readonly question: string;
    /** The wire `request_id`, injected so a test can pin it. Production passes a fresh one. */
    readonly requestId: string;
    readonly priorSubjectReceipts?: readonly BoundReceipt[] | undefined;
    readonly structureReceipts?: StructureReceipts | undefined;
    readonly conversation?: readonly ConversationTurn[] | undefined;
    readonly expectedKinds?: readonly ExpectedKind[] | undefined;
    readonly parentResultId?: string | undefined;
    readonly subjectHints?: readonly SubjectHint[] | undefined;
};

const MAX_PRIOR_SUBJECT_RECEIPTS = 20;
const MAX_STRUCTURE_RECEIPTS = 20;
const MAX_EXPECTED_KINDS = 15;

/** Deduplicates by `(result_id, receipt_id)` and caps at `limit` (`uniqueItems`/`maxItems`). */
function dedupeAndCap(receipts: readonly BoundReceipt[], limit: number): BoundReceipt[] {
    return [
        ...new Map(
            receipts.map((receipt) => [
                `${receipt.result_id}|${receipt.receipt_id}`,
                // Rebuilt: only the two wire fields survive, whatever else the caller's object holds.
                { result_id: receipt.result_id, receipt_id: receipt.receipt_id },
            ]),
        ).values(),
    ].slice(0, limit);
}

/** A fresh wire `request_id`, in the shape the ask-dev builder mints. */
export function newRequestId(uuid: string = crypto.randomUUID()): string {
    return `request_${uuid.replaceAll("-", "").slice(0, 24)}`;
}

/** Builds the wire request. Pure: same input, same bytes. */
export function buildInvestigationRequest(
    input: InvestigationRequestInput,
    consumer: ConsumerInfo = WEB_CONSUMER,
): InvestigationRequest {
    const structure = input.structureReceipts ?? {};
    // The generated types render `maxItems` as a tuple union no runtime array satisfies; the
    // slice is what enforces the bound, and the route validates the request against the schema.
    const structureFields: Partial<
        Pick<
            InvestigationRequest,
            | "prior_kind_receipts"
            | "prior_anchor_receipts"
            | "prior_handle_receipts"
            | "prior_window_receipts"
            | "prior_candidate_receipts"
        >
    > = {};
    const kind = dedupeAndCap(structure.priorKindReceipts ?? [], MAX_STRUCTURE_RECEIPTS);
    if (kind.length > 0)
        structureFields.prior_kind_receipts = kind as NonNullable<
            InvestigationRequest["prior_kind_receipts"]
        >;
    const anchor = dedupeAndCap(structure.priorAnchorReceipts ?? [], MAX_STRUCTURE_RECEIPTS);
    if (anchor.length > 0)
        structureFields.prior_anchor_receipts = anchor as NonNullable<
            InvestigationRequest["prior_anchor_receipts"]
        >;
    const handle = dedupeAndCap(structure.priorHandleReceipts ?? [], MAX_STRUCTURE_RECEIPTS);
    if (handle.length > 0)
        structureFields.prior_handle_receipts = handle as NonNullable<
            InvestigationRequest["prior_handle_receipts"]
        >;
    const window = dedupeAndCap(structure.priorWindowReceipts ?? [], MAX_STRUCTURE_RECEIPTS);
    if (window.length > 0)
        structureFields.prior_window_receipts = window as NonNullable<
            InvestigationRequest["prior_window_receipts"]
        >;
    const candidate = dedupeAndCap(structure.priorCandidateReceipts ?? [], MAX_STRUCTURE_RECEIPTS);
    if (candidate.length > 0)
        structureFields.prior_candidate_receipts = candidate as NonNullable<
            InvestigationRequest["prior_candidate_receipts"]
        >;

    const subjectReceipts = dedupeAndCap(
        input.priorSubjectReceipts ?? [],
        MAX_PRIOR_SUBJECT_RECEIPTS,
    ) as NonNullable<InvestigationRequest["prior_subject_receipts"]>;
    const conversation = (input.conversation ?? [])
        .slice(-MAX_CONVERSATION_TURNS_ON_WIRE)
        .map((turn) => ({
            turn_id: turn.turn_id,
            role: turn.role,
            content: turn.content,
            created_at: turn.created_at,
        }));
    const expectedKinds = [...new Set(input.expectedKinds ?? [])].slice(
        0,
        MAX_EXPECTED_KINDS,
    ) as NonNullable<InvestigationRequest["expected_kinds"]>;
    const subjectHints = (input.subjectHints ?? [])
        .slice(0, MAX_SUBJECT_HINTS_ON_WIRE)
        .map((hint) => ({
            kind: hint.kind,
            ...(hint.id === undefined ? {} : { id: hint.id }),
            ...(hint.label === undefined ? {} : { label: hint.label }),
            source: hint.source,
        }));

    return {
        schema_version: "context_fabric_investigation_request.v1",
        request_id: input.requestId,
        question: input.question,
        ...(conversation.length > 0 ? { conversation } : {}),
        prior_subject_receipts: subjectReceipts,
        ...structureFields,
        ...(expectedKinds.length > 0 ? { expected_kinds: expectedKinds } : {}),
        ...(input.parentResultId !== undefined ? { parent_result_id: input.parentResultId } : {}),
        ...(subjectHints.length > 0 ? { requested_scope: { subject_hints: subjectHints } } : {}),
        time_context: { axis: "current" },
        options: {
            max_subject_candidates: 10,
            max_cohort_members: 50,
            max_relationship_paths: 50,
            max_drivers: 10,
            max_evidence_refs: 100,
            max_serialized_bytes: 262_144,
            allow_clarification: true,
            include_debug: false,
        },
        consumer: { name: consumer.name, version: consumer.version, surface: consumer.surface },
    } as InvestigationRequest;
}
