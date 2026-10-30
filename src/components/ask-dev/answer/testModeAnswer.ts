"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import { logger } from "@/lib/logger";

import type { TranscriptResult, TranscriptTurn } from "./AskDevTurn";
import type { ClarificationChoice } from "./clarificationModel";
import type { NarrowerReask, RefusalTurn } from "./refusalModel";

/**
 * Test mode only: the panel shows the turns that a Playwright run put into session storage under
 * `TEST_MODE_ANSWER_KEY` (one turn, or an array of turns in order: an ACR result, or
 * `{ question, refusal }` for a stream that ended with an error event), so the e2e suite and the
 * screenshots render captured ACR output in the real panel (CHAOS-11930, CHAOS-3440). A choice
 * sent from the live turn is written under `TEST_MODE_CHOICE_KEY`, a narrower re-ask under
 * `TEST_MODE_REASK_KEY`, where the e2e suite reads them. The conversation store (CHAOS-11928)
 * becomes the turn source of the product.
 *
 * It never ships: a production build inlines `process.env.NODE_ENV` as "production", so `TEST_MODE`
 * is `false`, `useTestModeTurns` is `useNoTurns`, and the storage code is dead code the minifier
 * drops. (`NEXT_PUBLIC_DEV_HEALTH_TEST_MODE` alone is not enough: a build with the variable unset
 * keeps it as a runtime lookup.) Test mode itself is set only by the Playwright `next dev` servers.
 * `check:client-bundle` rule K6 fails the build if any of the keys reaches a client file.
 */
export const TEST_MODE_ANSWER_KEY = "ask-dev:test-mode-answer";
export const TEST_MODE_CHOICE_KEY = "ask-dev:test-mode-choice";
export const TEST_MODE_REASK_KEY = "ask-dev:test-mode-reask";

const TEST_MODE =
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

const STATUSES = new Set(["complete", "partial", "degraded", "clarification_required", "no_match"]);
const ARRAY_FIELDS = [
    "strongest_pressures",
    "drivers",
    "remaining_work",
    "readiness_gaps",
    "conflicts",
] as const;
const STRING_FIELDS = [
    "result_id",
    "question",
    "deterministic_answer",
    "direct_judgment",
    "current_state",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** The fields the transcript reads, checked for shape; anything else is not a result turn. */
export function asTranscriptResult(value: unknown): TranscriptResult | null {
    if (!isRecord(value)) return null;
    if (typeof value.status !== "string" || !STATUSES.has(value.status)) return null;
    if (!STRING_FIELDS.every((field) => typeof value[field] === "string")) return null;
    if (!ARRAY_FIELDS.every((field) => Array.isArray(value[field]))) return null;
    if (!isRecord(value.versions)) return null;
    if (!isRecord(value.subject_resolution)) return null;
    return value as TranscriptResult;
}

/** A question and the error event ACR ended its stream with; anything else is not a refusal. */
export function asRefusalTurn(value: unknown): RefusalTurn | null {
    if (!isRecord(value) || typeof value.question !== "string") return null;
    const event = value.refusal;
    if (!isRecord(event) || event.type !== "error") return null;
    if (typeof event.reserved_result_id !== "string") return null;
    const envelope = event.error;
    if (!isRecord(envelope) || envelope.schema_version !== "error.v1") return null;
    const error = envelope.error;
    if (!isRecord(error) || typeof error.code !== "string") return null;
    if (typeof error.retryable !== "boolean") return null;
    return value as RefusalTurn;
}

/** One stored turn or an array of them; `null` when any entry is not a turn. */
export function asTranscriptTurns(value: unknown): TranscriptTurn[] | null {
    const entries = Array.isArray(value) ? value : [value];
    const turns = entries.map((entry) => asTranscriptResult(entry) ?? asRefusalTurn(entry));
    return turns.every((turn): turn is TranscriptTurn => turn !== null) ? turns : null;
}

export type TestModeTurns = {
    readonly turns: readonly TranscriptTurn[];
    readonly onConfirm: ((choice: ClarificationChoice) => void) | undefined;
    readonly onReask: ((reask: NarrowerReask) => void) | undefined;
};

const NO_TURNS: TestModeTurns = { turns: [], onConfirm: undefined, onReask: undefined };
const noSubscription = () => () => undefined;
const noStoredTurns = () => null;

function readStoredTurns(): string | null {
    try {
        return window.sessionStorage.getItem(TEST_MODE_ANSWER_KEY);
    } catch {
        return null;
    }
}

function storeOutput(key: string, value: unknown): void {
    try {
        window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        logger.warn({ err: error, key }, "test-mode turn output not stored");
    }
}

function useStoredTurns(): TestModeTurns {
    const raw = useSyncExternalStore(noSubscription, readStoredTurns, noStoredTurns);
    const onConfirm = useCallback(
        (choice: ClarificationChoice) => storeOutput(TEST_MODE_CHOICE_KEY, choice),
        [],
    );
    const onReask = useCallback(
        (reask: NarrowerReask) => storeOutput(TEST_MODE_REASK_KEY, reask),
        [],
    );
    return useMemo(() => {
        if (raw === null) return NO_TURNS;
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            logger.warn({ err: error, key: TEST_MODE_ANSWER_KEY }, "test-mode turns are not JSON");
            return NO_TURNS;
        }
        const turns = asTranscriptTurns(parsed);
        if (turns === null) {
            logger.warn({ key: TEST_MODE_ANSWER_KEY }, "test-mode turns are not turns");
            return NO_TURNS;
        }
        return { turns, onConfirm, onReask };
    }, [raw, onConfirm, onReask]);
}

function useNoTurns(): TestModeTurns {
    return NO_TURNS;
}

/** The test-mode turns and their output sinks: always none outside test mode. */
export const useTestModeTurns: () => TestModeTurns = TEST_MODE ? useStoredTurns : useNoTurns;
