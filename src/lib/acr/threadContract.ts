/**
 * Checks of the ACR thread bodies in the browser (CHAOS-11956).
 *
 * The browser reads `GET /threads` and `GET /threads/{id}` directly and must check each body against
 * `context_fabric_thread.v1` / `context_fabric_thread_list.v1` before the store maps it. The repo's
 * runtime checker (`validateAcrContract`) compiles Ajv validators with `new Function`; production
 * CSP has no `unsafe-eval`, so it cannot run in the browser there (and e2e test mode, which allows
 * eval, would hide that). The validators here are Ajv standalone code, generated from the vendored
 * schemas by `scripts/acr-contract-artifacts.mjs` with the options of `contracts.ts`: no eval at
 * runtime, no hand-written second implementation, and `pnpm acr:contracts:check` fails on any drift.
 * `__tests__/threadContract.differential.test.ts` holds them equal to `validateAcrContract` over
 * cases built from the schema files, and checks they answer with eval and `Function` disabled.
 *
 * This module only MAPS a body that passed to the narrow views the store reads.
 *
 * Do not import `ajv` or `@/lib/acr/contracts` here: both would put the runtime Ajv in the browser.
 */
import type {
    ThreadListView,
    ThreadSummaryView,
    ThreadTurnState,
    ThreadTurnView,
    ThreadView,
} from "@/components/ask-dev/conversation/transport";

import { validateThread, validateThreadList } from "./threadValidators";

type TurnBody = {
    readonly submission_id: string;
    readonly state: ThreadTurnState;
    readonly question?: string;
    readonly result_id?: string;
    readonly result_withheld?: true;
    readonly admitted_at: string;
};

type ThreadBody = {
    readonly thread_id: string;
    readonly turn_count: number;
    readonly created_at: string;
    readonly last_turn_at: string;
    readonly expires_at: string;
    readonly turns: readonly TurnBody[];
    readonly earlier_turns_cursor?: string;
};

type SummaryBody = {
    readonly thread_id: string;
    readonly turn_count: number;
    readonly created_at: string;
    readonly last_turn_at: string;
    readonly expires_at: string;
    readonly first_question?: string;
};

type ListBody = {
    readonly threads: readonly SummaryBody[];
    readonly next_cursor?: string;
};

function turnView(turn: TurnBody): ThreadTurnView {
    return {
        submissionId: turn.submission_id,
        state: turn.state,
        question: turn.question ?? null,
        resultId: turn.result_id ?? null,
        resultWithheld: turn.result_withheld === true,
        admittedAt: turn.admitted_at,
    };
}

function summaryView(summary: SummaryBody): ThreadSummaryView {
    return {
        threadId: summary.thread_id,
        turnCount: summary.turn_count,
        createdAt: summary.created_at,
        lastTurnAt: summary.last_turn_at,
        expiresAt: summary.expires_at,
        firstQuestion: summary.first_question ?? null,
    };
}

/** Returns the view of a `context_fabric_thread.v1` body, or `null` when the schema refuses it. */
export function parseThread(value: unknown): ThreadView | null {
    if (!validateThread(value)) return null;
    const body = value as ThreadBody;
    return {
        threadId: body.thread_id,
        turnCount: body.turn_count,
        createdAt: body.created_at,
        lastTurnAt: body.last_turn_at,
        expiresAt: body.expires_at,
        turns: body.turns.map(turnView),
        earlierTurnsCursor: body.earlier_turns_cursor ?? null,
    };
}

/** Returns the view of a `context_fabric_thread_list.v1` body, or `null` when the schema refuses it. */
export function parseThreadList(value: unknown): ThreadListView | null {
    if (!validateThreadList(value)) return null;
    const body = value as ListBody;
    return { threads: body.threads.map(summaryView), nextCursor: body.next_cursor ?? null };
}
