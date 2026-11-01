import { inspect } from "node:util";

import { describe, expect, it, vi } from "vitest";

vi.mock("@playwright/test", () => ({ expect: () => undefined }));

import {
    ACR,
    CONNECT_WORDS,
    secretsOf,
    watchAcr,
    watchAuthorization,
} from "../../tests/live/ask-dev/stack";

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

describe("what P1-6 watches", () => {
    const WEB = "http://localhost:3000";

    function watched(requests: readonly (readonly [string, string])[]) {
        const listeners: Record<string, (value: unknown) => void> = {};
        const seen = watchAuthorization({
            on: ((name: string, listener: (value: unknown) => void) => {
                listeners[name] = listener;
            }) as never,
        });
        for (const [method, url] of requests) {
            listeners.request!({ url: () => url, method: () => method });
        }
        return seen;
    }

    it("sees web's route and ACR's OAuth requests, which a panel open must not send", () => {
        expect(
            watched([
                ["POST", `${WEB}/api/ask-dev/authorize`],
                ["GET", `${ACR}/.well-known/oauth-authorization-server`],
                ["POST", `${ACR}/token`],
                ["POST", `${ACR}/revoke`],
            ]),
        ).toEqual([
            "POST /api/ask-dev/authorize",
            "GET /.well-known/oauth-authorization-server",
            "POST /token",
            "POST /revoke",
        ]);
    });

    it("leaves ACR's data calls to `watchAcr`, and web's other routes alone", () => {
        expect(
            watched([
                ["GET", `${ACR}/api/v1/context-fabric/threads`],
                ["GET", `${WEB}/api/auth/session`],
                ["GET", `${WEB}/dashboard`],
            ]),
        ).toEqual([]);
    });

    it("keeps no query: a flow URL may hold a code or a state", () => {
        const seen = watched([["GET", `${ACR}/authorize?state=do_not_print&code_challenge=x`]]);
        expect(seen).toEqual(["GET /authorize"]);
        expect(JSON.stringify(seen)).not.toContain("do_not_print");
    });
});

describe("the words a panel must not say", () => {
    it.each(["Connect Ask Dev", "connect", "Reconnect to Ask Dev"])("catches %s", (words) => {
        expect(words).toMatch(CONNECT_WORDS);
    });

    it.each(["The connection dropped.", "A repository connected just now"])(
        "lets %s through",
        (words) => {
            expect(words).not.toMatch(CONNECT_WORDS);
        },
    );
});
