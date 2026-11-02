// CHAOS-12574: first, cancel this tab's live Ask Dev run while its ACR token is still held
// (bounded, best effort).
// CHAOS-12096 (design T4, §2.4): sign-out order is (1) revoke the Ops session through this web
// server, (2) revoke the ACR token family with its refresh token, (3) clear the ACR token state in
// every tab and forget this tab's Ask Dev conversation (CHAOS-12575), (4) NextAuth signOut(). (1) is
// retried once; when it still fails, (2)-(4) still run and the sign-in page shows the partial
// notice. No token reaches a log line.
import { describe, expect, it, vi } from "vitest";

import type { AcrSignOutHook } from "@/lib/ask-dev/acr-sign-out";
import {
    SIGN_OUT_CANCEL_TIMEOUT_MS,
    SESSION_REVOKE_PATH,
    SIGNED_OUT_PARTIAL_REDIRECT,
    signOutEverywhere,
    type SignOutDeps,
} from "../signOutEverywhere";

const REFRESH = "fcacr_refresh_SECRET_VALUE_never_logged";
const REVOKE_URL = "https://acr.example.test/revoke";
const CLIENT_ID = "https://app.example.test/oauth/acr-client.json";

type Harness = {
    readonly deps: SignOutDeps;
    readonly steps: string[];
    readonly fetchMock: ReturnType<typeof vi.fn>;
    readonly logLines: unknown[];
    readonly cancelSignals: AbortSignal[];
};

function harness(input: {
    readonly opsStatuses?: readonly (number | "throw")[];
    readonly acrStatus?: number | "throw";
    readonly family?: boolean;
    readonly clearThrows?: boolean;
    readonly forgetThrows?: boolean;
    readonly cancel?: "ok" | "throw" | "hang";
}): Harness {
    const steps: string[] = [];
    const logLines: unknown[] = [];
    const cancelSignals: AbortSignal[] = [];
    let opsCall = 0;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        if (target === SESSION_REVOKE_PATH) {
            const status = input.opsStatuses?.[opsCall] ?? 204;
            opsCall += 1;
            steps.push(`ops:${status}`);
            if (status === "throw") throw new TypeError("network down");
            return new Response(null, { status });
        }
        if (target === REVOKE_URL) {
            steps.push(`acr:${input.acrStatus ?? 200}`);
            expect(init?.body).toBeDefined();
            if (input.acrStatus === "throw") throw new TypeError("blocked");
            return new Response("{}", { status: input.acrStatus ?? 200 });
        }
        throw new Error(`unexpected fetch ${target}`);
    });
    const hook: AcrSignOutHook = {
        clearAllTabs: () => {
            steps.push("clear");
            if (input.clearThrows) throw new Error("storage blocked");
        },
        heldFamily: () =>
            input.family === false
                ? null
                : { clientId: CLIENT_ID, refreshToken: REFRESH, revocationEndpoint: REVOKE_URL },
    };
    const capture =
        (level: string) =>
        (...args: unknown[]) => {
            logLines.push({ args, level });
        };
    return {
        deps: {
            fetch: fetchMock as unknown as typeof fetch,
            hook,
            cancelLiveRun: async (signal) => {
                steps.push("cancel");
                cancelSignals.push(signal);
                if (input.cancel === "throw") throw new Error("ACR unreachable");
                if (input.cancel === "hang") await new Promise(() => undefined);
            },
            forgetConversation: () => {
                steps.push("forget");
                if (input.forgetThrows) throw new Error("storage blocked");
            },
            log: { error: capture("error"), info: capture("info"), warn: capture("warn") },
            signOut: async (options) => {
                steps.push(`signOut:${options?.redirectTo ?? "default"}`);
            },
        },
        cancelSignals,
        fetchMock,
        logLines,
        steps,
    };
}

describe("signOutEverywhere", () => {
    it("Given every step succeeds, then it runs (0) cancel the live run, (1) Ops, (2) ACR family, (3) clear tabs and forget the conversation, (4) signOut in that order", async () => {
        const h = harness({});

        const outcome = await signOutEverywhere(h.deps);

        expect(h.steps).toEqual([
            "cancel",
            "ops:204",
            "acr:200",
            "clear",
            "forget",
            "signOut:default",
        ]);
        expect(outcome).toEqual({ familyRevoked: true, sessionRevoked: true });
    });

    it("Given the Ops revoke fails once, then it retries once and goes on as revoked", async () => {
        const h = harness({ opsStatuses: [503, 204] });

        const outcome = await signOutEverywhere(h.deps);

        expect(h.steps).toEqual([
            "cancel",
            "ops:503",
            "ops:204",
            "acr:200",
            "clear",
            "forget",
            "signOut:default",
        ]);
        expect(outcome.sessionRevoked).toBe(true);
    });

    it.each([
        ["two error answers", [502, 503] as const],
        ["a network error, then an error answer", ["throw", 500] as const],
        ["no session (401) twice", [401, 401] as const],
    ])(
        "Given the Ops revoke fails twice (%s), then it logs loudly, still runs (2)-(4), and signs out to the partial notice",
        async (_name, statuses) => {
            const h = harness({ opsStatuses: statuses });

            const outcome = await signOutEverywhere(h.deps);

            expect(h.steps.slice(3)).toEqual([
                "acr:200",
                "clear",
                "forget",
                `signOut:${SIGNED_OUT_PARTIAL_REDIRECT}`,
            ]);
            expect(
                h.fetchMock.mock.calls.filter(([url]) => url === SESSION_REVOKE_PATH),
            ).toHaveLength(2);
            expect(outcome.sessionRevoked).toBe(false);
            expect(h.logLines).toContainEqual(expect.objectContaining({ level: "error" }));
        },
    );

    it("Given no ACR family is held, then step (2) makes no request and (3)-(4) still run", async () => {
        const h = harness({ family: false });

        const outcome = await signOutEverywhere(h.deps);

        expect(h.steps).toEqual(["cancel", "ops:204", "clear", "forget", "signOut:default"]);
        expect(outcome.familyRevoked).toBeNull();
    });

    it("Given a family, then (2) posts the RFC 7009 form with the refresh token to the family's revocation endpoint, with no cookie", async () => {
        const h = harness({});

        await signOutEverywhere(h.deps);

        const call = h.fetchMock.mock.calls.find(([url]) => url === REVOKE_URL);
        expect(call).toBeDefined();
        const init = call?.[1] as RequestInit;
        expect(init.method).toBe("POST");
        expect(init.credentials).toBe("omit");
        expect(new Headers(init.headers).get("content-type")).toBe(
            "application/x-www-form-urlencoded",
        );
        expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
            client_id: CLIENT_ID,
            token: REFRESH,
        });
    });

    it.each([
        ["an error answer", 503 as const],
        ["a blocked request", "throw" as const],
    ])(
        "Given the ACR family revoke fails (%s), then (3) and (4) still run",
        async (_name, acrStatus) => {
            const h = harness({ acrStatus });

            const outcome = await signOutEverywhere(h.deps);

            expect(h.steps.slice(-3)).toEqual(["clear", "forget", "signOut:default"]);
            expect(outcome.familyRevoked).toBe(false);
        },
    );

    it("Given clearing the tabs throws, then the conversation is still forgotten and signOut still runs", async () => {
        const h = harness({ clearThrows: true });

        await signOutEverywhere(h.deps);

        expect(h.steps.slice(-3)).toEqual(["clear", "forget", "signOut:default"]);
    });

    // CHAOS-12575: the tab's restore hint outlived sign-out, so the same user's next session
    // restored a conversation it could not read, with its composer disabled.
    it("Given forgetting the conversation throws, then signOut still runs, and the failure is logged", async () => {
        const h = harness({ forgetThrows: true });

        await signOutEverywhere(h.deps);

        expect(h.steps.slice(-2)).toEqual(["forget", "signOut:default"]);
        expect(JSON.stringify(h.logLines)).toContain("ask_dev_conversation_forget");
    });

    it("Given the live-run cancel throws, then every later step still runs, and the failure is logged", async () => {
        const h = harness({ cancel: "throw" });

        await signOutEverywhere(h.deps);

        expect(h.steps).toEqual([
            "cancel",
            "ops:204",
            "acr:200",
            "clear",
            "forget",
            "signOut:default",
        ]);
        expect(JSON.stringify(h.logLines)).toContain("ask_dev_run_cancel");
    });

    it("Given the live-run cancel hangs, then it is cut at its timeout, says so, and sign-out goes on", async () => {
        vi.useFakeTimers();
        try {
            const h = harness({ cancel: "hang" });

            const done = signOutEverywhere(h.deps);
            await vi.advanceTimersByTimeAsync(SIGN_OUT_CANCEL_TIMEOUT_MS);
            await done;

            expect(h.steps.at(-1)).toBe("signOut:default");
            expect(h.cancelSignals[0]?.aborted).toBe(true);
            expect(JSON.stringify(h.logLines)).toContain("ask_dev_run_cancel_timeout");
        } finally {
            vi.useRealTimers();
        }
    });

    it("Given the live-run cancel ends in time, then its signal is not aborted", async () => {
        const h = harness({});

        await signOutEverywhere(h.deps);

        expect(h.cancelSignals).toHaveLength(1);
        expect(h.cancelSignals[0]?.aborted).toBe(false);
    });

    it("Given every failure path, then no log line carries the refresh token", async () => {
        const h = harness({ acrStatus: "throw", clearThrows: true, opsStatuses: ["throw", 503] });

        await signOutEverywhere(h.deps);

        expect(h.logLines.length).toBeGreaterThanOrEqual(3);
        expect(JSON.stringify(h.logLines)).not.toContain(REFRESH);
        expect(JSON.stringify(h.logLines)).not.toContain("fcacr_");
    });
});
