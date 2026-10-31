import type { ConversationTurn, SubjectHint } from "@/lib/acr/generated";

/**
 * Conversation threading for Ask Dev turn 2+ (North Star check 6: the investigation context
 * persists across turns). Ported from the ask-dev repo's `src/lib/conversation.ts`; the
 * differential test in `__tests__/request-builder.differential.test.ts` holds the two in step.
 *
 * Nothing here carries authorization. A turn holds the question, the answer sentence and the
 * result id; org, principal and repository scope are read fresh by the server on every call.
 */

/** The contract's own bound on `conversation` (`@maxItems 50`). */
export const MAX_CONVERSATION_TURNS_ON_WIRE = 50;
/** How many prior turns a re-ask threads (10 user/assistant exchanges). */
export const MAX_CONVERSATION_TURNS_SENT = 20;
/** The contract's own bound on `requested_scope.subject_hints` (`@maxItems 50`). */
export const MAX_SUBJECT_HINTS_ON_WIRE = 50;

/**
 * `SubjectHint.source` stamped on every hint derived here. It is never one of the engine's own
 * minted sources, so ACR reads the hint as caller-authored.
 */
export const PARENT_SUBJECT_HINT_SOURCE = "ask_dev_parent_result_subject";

export type SubjectHintKind = SubjectHint["kind"];

const SUBJECT_KIND_MEMBERSHIP: Record<SubjectHintKind, true> = {
    organization: true,
    team: true,
    project: true,
    repository: true,
    work_item: true,
    pull_request: true,
    deployment: true,
    incident: true,
    document: true,
    decision: true,
    episode: true,
    metric: true,
    pull_request_review: true,
    ci_pipeline_run: true,
    work_item_ref: true,
};

/** Closed `SubjectHint.kind` vocabulary; keyed by a `Record` so a pin bump is a compile error. */
export const SUBJECT_KIND_VOCABULARY: readonly SubjectHintKind[] = Object.keys(
    SUBJECT_KIND_MEMBERSHIP,
) as SubjectHintKind[];

/** Invisible characters (white space, format, nonspacing marks) that make a string blank. */
const INVISIBLE_CONTENT = /[\p{White_Space}\p{Cf}\p{Mn}]/gu;

/** `undefined` unless `value` has visible content. */
export function nonBlank(value: string | undefined): string | undefined {
    if (value === undefined) return undefined;
    return value.replace(INVISIBLE_CONTENT, "") !== "" ? value : undefined;
}

type CommittedSubject = {
    readonly kind: string;
    readonly canonical_id: string;
    readonly label: string;
};

/** The minimal timeline shape the builders read. The store's own turn type satisfies it. */
export type ConversationSourceTurn =
    | {
          readonly role: "user";
          readonly id: number;
          readonly question: string;
          readonly createdAt: string;
      }
    | {
          readonly role: "assistant";
          readonly id: number;
          readonly createdAt: string;
          readonly outcome:
              | { readonly kind: "pending" }
              | { readonly kind: "failed" }
              | {
                    readonly kind: "answered";
                    readonly result: {
                        readonly deterministic_answer: string;
                        readonly result_id: string;
                        readonly subject_resolution: {
                            readonly committed: readonly CommittedSubject[];
                        };
                    };
                };
      };

/**
 * `conversation` for a re-ask from the PRIOR turns (the fresh pair is not yet appended). A
 * pending or failed assistant turn is left out, and so is an answered turn whose sentence is
 * blank (the contract refuses `content: ""`).
 */
export function buildConversationTurns(
    priorTurns: readonly ConversationSourceTurn[],
): readonly ConversationTurn[] {
    const settled: ConversationTurn[] = [];
    for (const turn of priorTurns) {
        if (turn.role === "user") {
            settled.push({
                turn_id: `turn_${String(turn.id)}`,
                role: "user",
                content: turn.question,
                created_at: turn.createdAt,
            });
            continue;
        }
        if (turn.outcome.kind !== "answered") continue;
        const answer = nonBlank(turn.outcome.result.deterministic_answer);
        if (answer === undefined) continue;
        settled.push({
            turn_id: `turn_${String(turn.id)}`,
            role: "assistant",
            content: answer,
            created_at: turn.createdAt,
        });
    }
    return settled.slice(-MAX_CONVERSATION_TURNS_SENT);
}

/** A committed subject whose kind the request contract cannot carry as a hint. */
export type UnsentSubject = {
    readonly kind: string;
    readonly label: string;
};

export type ParentReference = {
    readonly parentResultId: string | undefined;
    readonly subjectHints: readonly SubjectHint[];
    /** Committed subjects that could not be sent as hints; empty when none. */
    readonly unsentSubjects: readonly UnsentSubject[];
};

/** The visible sentence for subjects a follow-up cannot carry, or `undefined` when none. */
export function unsentSubjectsNotice(unsent: readonly UnsentSubject[]): string | undefined {
    if (unsent.length === 0) return undefined;
    const labels = unsent.map((subject) => subject.label).join(", ");
    return `This follow-up does not carry ${labels} as its subject, because it is not sent as a scope hint (its kind is not accepted, or the follow-up already carries the most hints the service allows). Name it in the question if the answer should stay about it.`;
}

/**
 * The same-conversation carry: `parent_result_id` names the result the follow-up builds on, and
 * `subject_hints` restate the subjects THAT result committed. Reads only the last turn; a first
 * turn, or one whose predecessor did not answer, carries neither.
 */
export function deriveParentReference(
    priorTurns: readonly ConversationSourceTurn[],
): ParentReference {
    const last = priorTurns[priorTurns.length - 1];
    if (last === undefined || last.role !== "assistant" || last.outcome.kind !== "answered") {
        return { parentResultId: undefined, subjectHints: [], unsentSubjects: [] };
    }
    const { result } = last.outcome;
    const unsentSubjects: UnsentSubject[] = [];
    const allHints: readonly SubjectHint[] = result.subject_resolution.committed.flatMap(
        (subject) => {
            const kind = SUBJECT_KIND_VOCABULARY.find((known) => known === subject.kind);
            if (kind === undefined) {
                unsentSubjects.push({ kind: subject.kind, label: subject.label });
                return [];
            }
            return [
                {
                    kind,
                    id: subject.canonical_id,
                    label: subject.label,
                    source: PARENT_SUBJECT_HINT_SOURCE,
                },
            ];
        },
    );
    const sentHints = allHints.slice(0, MAX_SUBJECT_HINTS_ON_WIRE);
    for (const cut of allHints.slice(MAX_SUBJECT_HINTS_ON_WIRE)) {
        unsentSubjects.push({ kind: cut.kind, label: cut.label ?? cut.id ?? cut.kind });
    }
    return { parentResultId: result.result_id, subjectHints: sentHints, unsentSubjects };
}
