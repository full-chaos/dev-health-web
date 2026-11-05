/**
 * CHAOS-12232: what the history and reload cases read off the browser's own ACR calls and the drawn
 * transcript. Pure TypeScript with no Playwright import, so `ci/__tests__/ask-dev-history-views.test.ts`
 * can plant each wrong call or order and prove it is reported.
 */
import type { AcrCall } from "./stack";

/** ACR's thread routes (web `transport.ts`): the list, and one thread's read and delete. */
export const THREADS_PATH = "/api/v1/context-fabric/threads";

/** One thread's reads (the panel's or /dev's restore): never the list, a delete or another id. */
export const threadReads = (calls: readonly AcrCall[], threadId: string): readonly AcrCall[] =>
    calls.filter((call) => call.method === "GET" && call.path === `${THREADS_PATH}/${threadId}`);

/** History's list reads. */
export const threadLists = (calls: readonly AcrCall[]): readonly AcrCall[] =>
    calls.filter((call) => call.method === "GET" && call.path === THREADS_PATH);

/** One thread's deletes. */
export const threadDeletes = (calls: readonly AcrCall[], threadId: string): readonly AcrCall[] =>
    calls.filter((call) => call.method === "DELETE" && call.path === `${THREADS_PATH}/${threadId}`);

/**
 * AC-2: every turn the conversation holds is drawn once, in the order it was asked. A turn drawn
 * twice is a restore that added a turn; one not drawn is a restore that lost it.
 */
export function turnOrderMismatches(transcript: string, questions: readonly string[]): string[] {
    const mismatches: string[] = [];
    const drawn: Array<{ question: string; at: number }> = [];
    for (const question of questions) {
        const times = transcript.split(question).length - 1;
        if (times === 0) mismatches.push(`"${question}" is not drawn`);
        else if (times > 1) mismatches.push(`"${question}" is drawn ${String(times)} times`);
        else drawn.push({ question, at: transcript.indexOf(question) });
    }
    drawn.forEach((turn, index) => {
        const before = drawn[index - 1];
        if (before !== undefined && turn.at < before.at) {
            mismatches.push(`"${turn.question}" is drawn before "${before.question}"`);
        }
    });
    return mismatches;
}
