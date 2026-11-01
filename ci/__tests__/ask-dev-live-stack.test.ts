import { inspect } from "node:util";

import { describe, expect, it, vi } from "vitest";

vi.mock("@playwright/test", () => ({ expect: () => undefined }));

import { ACR, secretsOf, watchAcr } from "../../tests/live/ask-dev/stack";

/**
 * CHAOS-11933: a failed assertion in the live suite prints what it was given, and Playwright copies
 * that into `error-context.md` and the report. So the recorded call must hold no bearer.
 */

const BEARER = "fcacr_sentinel_do_not_print";

function recorded() {
    const listeners: Record<string, (value: unknown) => void> = {};
    const calls = watchAcr({
        on: ((name: string, listener: (value: unknown) => void) => {
            listeners[name] = listener;
        }) as never,
    });
    const request = {
        url: () => `${ACR}/api/v1/context-fabric/investigations`,
        method: () => "POST",
        headers: () => ({
            authorization: `Bearer ${BEARER}`,
            "x-acr-submission-id": "sub_1",
        }),
        postData: () => '{"question":"q"}',
    };
    listeners.request!(request);
    return calls;
}

describe("the live suite's call record", () => {
    it("holds no bearer in anything an assertion can print", () => {
        const calls = recorded();
        expect(calls).toHaveLength(1);
        expect(JSON.stringify(calls)).not.toContain(BEARER);
        expect(inspect(calls, { depth: 10, showHidden: true })).not.toContain(BEARER);
        expect(calls[0]).toMatchObject({ method: "POST", hasBearer: true, cookie: false });
    });

    it("keeps what a case needs to repeat a call, apart from the record", () => {
        const [call] = recorded();
        expect(secretsOf(call!)).toEqual({
            bearer: BEARER,
            headers: { authorization: `Bearer ${BEARER}`, "x-acr-submission-id": "sub_1" },
            body: '{"question":"q"}',
        });
    });

    it("refuses a call it did not record", () => {
        const stray = {
            method: "GET",
            path: "/",
            query: new URLSearchParams(),
            hasBearer: false,
            cookie: false,
        };
        expect(() => secretsOf(stray)).toThrow("not recorded");
    });
});
