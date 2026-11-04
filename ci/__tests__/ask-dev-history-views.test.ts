import { describe, expect, it } from "vitest";

import {
    THREADS_PATH,
    threadDeletes,
    threadLists,
    threadReads,
    turnOrderMismatches,
} from "../../tests/live/ask-dev/history-views";
import type { AcrCall } from "../../tests/live/ask-dev/stack";

const call = (method: string, path: string, status = 200): AcrCall => ({
    method,
    path,
    query: new URLSearchParams(),
    hasBearer: true,
    cookie: false,
    status,
});

const A = "thread_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const AB = `${A}bb`;
const B = "thread_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const calls: AcrCall[] = [
    call("GET", THREADS_PATH),
    call("GET", `${THREADS_PATH}/${A}`),
    call("GET", `${THREADS_PATH}/${AB}`),
    call("GET", `${THREADS_PATH}/${B}`),
    call("DELETE", `${THREADS_PATH}/${A}`, 204),
    call("DELETE", `${THREADS_PATH}/${B}`, 204),
    call("POST", "/api/v1/context-fabric/investigations"),
    call("GET", `${THREADS_PATH}/${A}/feedback`),
];

describe("the thread calls a case counts (CHAOS-12232)", () => {
    it("a thread's reads are the GETs of that thread only: no list, delete, other id or longer path", () => {
        expect(threadReads(calls, A).map((c) => `${c.method} ${c.path}`)).toEqual([
            `GET ${THREADS_PATH}/${A}`,
        ]);
    });

    it("the list reads are the GETs of the list route only", () => {
        expect(threadLists(calls).map((c) => `${c.method} ${c.path}`)).toEqual([
            `GET ${THREADS_PATH}`,
        ]);
    });

    it("a thread's deletes are the DELETEs of that thread only", () => {
        expect(
            threadDeletes(calls, A).map((c) => `${c.method} ${c.path} ${String(c.status)}`),
        ).toEqual([`DELETE ${THREADS_PATH}/${A} 204`]);
    });
});

describe("turnOrderMismatches: the restored turns, each once, in order (CHAOS-12232 AC-2)", () => {
    const q1 = "Case histTurn1 n: what is the status?";
    const q2 = "Case histTurn2 n: what is the status?";

    it("finds nothing when each question is shown once, in the order asked", () => {
        expect(turnOrderMismatches(`${q1} answer one ${q2} answer two`, [q1, q2])).toEqual([]);
    });

    it("reports turns drawn out of order", () => {
        expect(turnOrderMismatches(`${q2} answer two ${q1} answer one`, [q1, q2])).toEqual([
            `"${q2}" is drawn before "${q1}"`,
        ]);
    });

    it("reports a turn that is not drawn, and a turn drawn twice", () => {
        expect(turnOrderMismatches(`${q1} answer one`, [q1, q2])).toEqual([`"${q2}" is not drawn`]);
        expect(turnOrderMismatches(`${q1} a ${q1} a ${q2} b`, [q1, q2])).toEqual([
            `"${q1}" is drawn 2 times`,
        ]);
    });
});
