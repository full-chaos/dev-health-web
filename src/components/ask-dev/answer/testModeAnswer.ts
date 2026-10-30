"use client";

import { useMemo, useSyncExternalStore } from "react";

import { logger } from "@/lib/logger";

import type { AnswerResult } from "./answerModel";

/**
 * Test mode only: the panel shows the answer that a Playwright run put into session storage under
 * this key, so the e2e suite and the screenshots render a captured ACR answer in the real panel
 * (CHAOS-11930). The conversation store (CHAOS-11928) becomes the answer source of the product.
 *
 * It never ships: a production build inlines `process.env.NODE_ENV` as "production", so `TEST_MODE`
 * is `false`, `useTestModeAnswer` is `useNoAnswer`, and the storage read is dead code the minifier
 * drops. (`NEXT_PUBLIC_DEV_HEALTH_TEST_MODE` alone is not enough: a build with the variable unset
 * keeps it as a runtime lookup.) Test mode itself is set only by the Playwright `next dev` servers.
 * `check:client-bundle` rule K6 fails the build if the key reaches a client file.
 */
export const TEST_MODE_ANSWER_KEY = "ask-dev:test-mode-answer";

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
const STRING_FIELDS = ["deterministic_answer", "direct_judgment", "current_state"] as const;

/** The fields the answer view reads, checked for shape; anything else is not an answer. */
export function asAnswerResult(value: unknown): AnswerResult | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (typeof record.status !== "string" || !STATUSES.has(record.status)) return null;
    if (!STRING_FIELDS.every((field) => typeof record[field] === "string")) return null;
    if (!ARRAY_FIELDS.every((field) => Array.isArray(record[field]))) return null;
    if (!record.versions || typeof record.versions !== "object") return null;
    return value as AnswerResult;
}

const noSubscription = () => () => undefined;
const noStoredAnswer = () => null;

function readStoredAnswer(): string | null {
    try {
        return window.sessionStorage.getItem(TEST_MODE_ANSWER_KEY);
    } catch {
        return null;
    }
}

function useStoredAnswer(): AnswerResult | null {
    const raw = useSyncExternalStore(noSubscription, readStoredAnswer, noStoredAnswer);
    return useMemo(() => {
        if (raw === null) return null;
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            logger.warn({ err: error, key: TEST_MODE_ANSWER_KEY }, "test-mode answer is not JSON");
            return null;
        }
        const answer = asAnswerResult(parsed);
        if (answer === null) {
            logger.warn({ key: TEST_MODE_ANSWER_KEY }, "test-mode answer is not an answer");
        }
        return answer;
    }, [raw]);
}

function useNoAnswer(): AnswerResult | null {
    return null;
}

/** The test-mode answer, or `null`: always `null` outside test mode. */
export const useTestModeAnswer: () => AnswerResult | null = TEST_MODE
    ? useStoredAnswer
    : useNoAnswer;
