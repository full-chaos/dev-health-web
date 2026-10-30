// CHAOS-12096 (design T4, §2.4): sign-out order is (1) revoke the Ops session through this web
// server, (2) revoke the ACR token family with its refresh token, (3) clear the ACR token state in
// every tab, (4) NextAuth signOut(). (1) is retried once; when it still fails, (2)-(4) still run and
// the sign-in page shows the partial notice. No token reaches a log line.
import { describe, expect, it, vi } from "vitest";

import type { AcrSignOutHook } from "@/lib/ask-dev/acr-sign-out";
import {
    SESSION_REVOKE_PATH,
    SIGNED_OUT_PARTIAL_REDIRECT,
    SIGNED_OUT_REDIRECT,
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
};

function harness(input: {
    readonly opsStatuses?: readonly (number | "throw")[];
    readonly acrStatus?: number | "throw";
    readonly family?: boolean;
    readonly clearThrows?: boolean;
}): Harness {
    const steps: string[] = [];
    const logLines: unknown[] = [];
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
            log: { error: capture("error"), info: capture("info"), warn: capture("warn") },
            signOut: async (options) => {
                steps.push(`signOut:${options.redirectTo}`);
            },
        },
        fetchMock,
        logLines,
        steps,
    };
}

describe("signOutEverywhere", () => {
    it("Given every step succeeds, then it runs (1) Ops, (2) ACR family, (3) clear tabs, (4) signOut in that order", async () => {
        const h = harness({});

        const outcome = await signOutEverywhere(h.deps);

        expect(h.steps).toEqual(["ops:204", "acr:200", "clear", `signOut:${SIGNED_OUT_REDIRECT}`]);
        expect(outcome).toEqual({ familyRevoked: true, sessionRevoked: true });
    });

    it("Given the Ops revoke fails once, then it retries once and goes on as revoked", async () => {
        const h = harness({ opsStatuses: [503, 204] });

        const outcome = await signOutEverywhere(h.deps);

        expect(h.steps).toEqual([
            "ops:503",
            "ops:204",
            "acr:200",
            "clear",
            `signOut:${SIGNED_OUT_REDIRECT}`,
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

            expect(h.steps.slice(2)).toEqual([
                "acr:200",
                "clear",
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

        expect(h.steps).toEqual(["ops:204", "clear", `signOut:${SIGNED_OUT_REDIRECT}`]);
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
            token_type_hint: "refresh_token",
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

            expect(h.steps.slice(-2)).toEqual(["clear", `signOut:${SIGNED_OUT_REDIRECT}`]);
            expect(outcome.familyRevoked).toBe(false);
        },
    );

    it("Given clearing the tabs throws, then signOut still runs", async () => {
        const h = harness({ clearThrows: true });

        await signOutEverywhere(h.deps);

        expect(h.steps.at(-1)).toBe(`signOut:${SIGNED_OUT_REDIRECT}`);
    });

    it("Given every failure path, then no log line carries the refresh token", async () => {
        const h = harness({ acrStatus: "throw", clearThrows: true, opsStatuses: ["throw", 503] });

        await signOutEverywhere(h.deps);

        expect(h.logLines.length).toBeGreaterThanOrEqual(3);
        expect(JSON.stringify(h.logLines)).not.toContain(REFRESH);
        expect(JSON.stringify(h.logLines)).not.toContain("fcacr_");
    });
});
