import { inspect } from "node:util";

import { describe, expect, it, vi } from "vitest";

// `expect.poll` reads once and does not wait: the waiting is Playwright's own; what is tested here is
// what the case helpers check once the page has drawn its results (CHAOS-12844).
vi.mock("@playwright/test", () => ({
    expect: Object.assign(() => undefined, {
        poll: (read: () => number, options?: { message?: string }) => ({
            toBeGreaterThanOrEqual: async (least: number) => {
                if (read() < least) throw new Error(options?.message);
            },
            toBeGreaterThan: async (least: number) => {
                if (read() <= least) throw new Error(options?.message);
            },
        }),
    }),
}));

import {
    ACR,
    CONNECT_WORDS,
    expectAnswersFallback,
    expectAnswersSynthesized,
    expectFallback,
    expectSynthesized,
    secretsOf,
    synthesisFallbackDetails,
    watchAcr,
    watchAuthorization,
    watchPageLoad,
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

describe("what a page that never drew was waiting for (CHAOS-11940)", () => {
    function page() {
        const listeners: Record<string, (value: unknown) => void> = {};
        const watched = {
            on: ((name: string, listener: (value: unknown) => void) => {
                listeners[name] = listener;
            }) as never,
            evaluate: () => Promise.resolve(false),
        };
        return { listeners, report: watchPageLoad(watched as never) };
    }
    const request = (url: string, method = "GET") => ({ url: () => url, method: () => method });

    it("names each open and failed request by method, host and path, never its query", async () => {
        const { listeners, report } = page();
        const open = request(`${ACR}/api/v1/context-fabric/threads?token=${BEARER}`);
        const done = request("http://localhost:3000/_next/static/chunks/main.js");
        const failed = request("http://localhost:3000/_next/static/chunks/app.js?v=1");
        for (const each of [open, done, failed]) listeners.request!(each);
        listeners.requestfinished!(done);
        listeners.requestfailed!(failed);
        const text = await report();
        expect(JSON.parse(text)).toEqual({
            hydrated: false,
            open: [`GET ${new URL(ACR).host}/api/v1/context-fabric/threads`],
            failed: ["GET localhost:3000/_next/static/chunks/app.js"],
        });
        expect(text).not.toContain(BEARER);
    });
});

/**
 * CHAOS-11946 / CHAOS-12844: acr serves a facts-only fallback when synthesis fails, marked by a
 * coverage detail from the synthesis step. A live case that expects an answer must reject that
 * fallback; a case that expects the fallback by design must see the marker.
 */
describe("synthesis fallback marker", () => {
    const served = (codes: string[]) => ({
        coverage: {
            details: codes.map((code) => ({
                source: "context-fabric:synthesis",
                code,
                raw: `${code}:synthesis_rejected`,
            })),
        },
    });

    it("finds the fallback details, and nothing else", () => {
        expect(synthesisFallbackDetails(served(["synthesis_model_failed"]))).toHaveLength(1);
        expect(synthesisFallbackDetails(served(["synthesis_not_run"]))).toHaveLength(1);
        expect(
            synthesisFallbackDetails(served(["fact_score_withheld", "synthesis_input_bounded"])),
        ).toEqual([]);
        expect(synthesisFallbackDetails({})).toEqual([]);
        expect(synthesisFallbackDetails(undefined)).toEqual([]);
    });

    // Codex P2 on #1804 (executed): an answer over the request's byte bound comes back as
    // context_fabric_answer_projection.v1, which has no `coverage`; its details are top-level
    // `coverage_details`, with the same shape and codes.
    it("finds the fallback details on a projected answer too", () => {
        const projected = {
            coverage_details: [
                {
                    source: "context-fabric:synthesis",
                    code: "synthesis_model_failed",
                    raw: "synthesis_model_failed:synthesis_rejected",
                },
            ],
        };
        expect(synthesisFallbackDetails(projected)).toHaveLength(1);
        expect(() => expectSynthesized(projected, "cohort1")).toThrow(
            "cohort1: the answer is acr's fallback, not a synthesized answer (synthesis_model_failed:synthesis_rejected)",
        );
        expect(
            synthesisFallbackDetails({ coverage_details: [{ code: "fact_score_withheld" }] }),
        ).toEqual([]);
    });

    it("refuses a fallback where a synthesized answer is expected, naming the case and the detail", () => {
        expect(() => expectSynthesized(served([]), "cohort1")).not.toThrow();
        expect(() => expectSynthesized(served(["synthesis_model_failed"]), "cohort1")).toThrow(
            "cohort1: the answer is acr's fallback, not a synthesized answer (synthesis_model_failed:synthesis_rejected)",
        );
    });

    it("refuses a synthesized answer where the fallback is expected by design", () => {
        expect(() => expectFallback(served(["synthesis_not_run"]), "model deadline")).not.toThrow();
        expect(() => expectFallback(served([]), "model deadline")).toThrow(
            "model deadline: the answer was expected to be acr's fallback, and it carries no synthesis failure",
        );
    });

    // CHAOS-12844: the case helpers hold EVERY result a page drew, and fail on too few.
    it("holds every result the page drew to the synthesized check, naming the one that failed", async () => {
        await expect(
            expectAnswersSynthesized([served([]), served([])], "thread header", 2),
        ).resolves.toBeUndefined();
        await expect(
            expectAnswersSynthesized([served([]), served(["synthesis_not_run"])], "P1-5", 2),
        ).rejects.toThrow(
            "P1-5, result 2: the answer is acr's fallback, not a synthesized answer (synthesis_not_run:synthesis_rejected)",
        );
        // Every result is checked, not the first two: the thread-header case draws three.
        await expect(
            expectAnswersSynthesized(
                [served([]), served([]), served(["synthesis_model_failed"])],
                "thread header",
                3,
            ),
        ).rejects.toThrow("thread header, result 3: the answer is acr's fallback");
        // A fallback after the count is still a fallback the page drew.
        await expect(
            expectAnswersSynthesized([served([]), served(["synthesis_model_failed"])], "P1-1"),
        ).rejects.toThrow("P1-1, result 2: the answer is acr's fallback");
    });

    it("fails when the page drew fewer results than the case needs: no result read is no pass", async () => {
        await expect(expectAnswersSynthesized([], "P1-1")).rejects.toThrow(
            "P1-1: no result captured: the page drew fewer than 1 results",
        );
        await expect(expectAnswersSynthesized([served([])], "P1-5", 2)).rejects.toThrow(
            "P1-5: no result captured: the page drew fewer than 2 results",
        );
    });

    it("holds a designed fallback's every result to the fallback check", async () => {
        await expect(
            expectAnswersFallback([served(["synthesis_not_run"])], "model deadline"),
        ).resolves.toBeUndefined();
        await expect(expectAnswersFallback([served([])], "model deadline")).rejects.toThrow(
            "model deadline, result 1: the answer was expected to be acr's fallback",
        );
        await expect(expectAnswersFallback([], "model deadline")).rejects.toThrow(
            "model deadline: no result captured",
        );
        // A second result that is synthesized fails the designed fallback too.
        await expect(
            expectAnswersFallback([served(["synthesis_not_run"]), served([])], "late synthesis"),
        ).rejects.toThrow("late synthesis, result 2: the answer was expected to be acr's fallback");
    });
});
