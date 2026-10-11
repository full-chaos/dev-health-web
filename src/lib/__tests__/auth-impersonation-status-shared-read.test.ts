import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CHAOS-9218: the jwt callback reads the impersonation status of a superuser from the backend.
// Requests of ONE user that arrive together when the 3 s keep has ended must share ONE read.
// Every test drives the real jwt callback of `@/lib/auth`; only `fetch` is replaced.

const { nextAuthConfig, sessionRead } = vi.hoisted(() => ({
    nextAuthConfig: { value: null as unknown },
    sessionRead: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next-auth", () => ({
    default: vi.fn((config: unknown) => {
        nextAuthConfig.value = config;
        return {
            auth: sessionRead,
            handlers: { GET: vi.fn(), POST: vi.fn() },
            signIn: vi.fn(),
            signOut: vi.fn(),
        };
    }),
    CredentialsSignin: class CredentialsSignin extends Error {
        code = "credentials";
    },
}));
vi.mock("next-auth/providers/credentials", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/github", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/gitlab", () => ({ default: vi.fn() }));
vi.mock("@/lib/origin", () => ({ getBackendUrl: () => "http://backend.test" }));

import { readdirSync, readFileSync } from "node:fs";
import { forgetOwnImpersonationStatus } from "@/lib/auth";
import {
    IMPERSONATION_STATUS_FAILURE_BACKOFF_MS,
    IMPERSONATION_STATUS_KEEP_MS,
    IMPERSONATION_STATUS_MAX_USERS,
    impersonationStatusKeysForTests,
    resetImpersonationStatusForTests,
} from "@/lib/impersonationStatusMemo";

type Token = Record<string, unknown>;
type JwtParams = {
    token: Token;
    user?: unknown;
    account?: unknown;
    trigger?: string;
    session?: unknown;
};
const jwt = (params: JwtParams): Promise<Token> =>
    (
        nextAuthConfig.value as { callbacks: { jwt: (p: JwtParams) => Promise<Token> } }
    ).callbacks.jwt(params);

const STATUS_PATH = "/api/v1/admin/impersonate/status";
const KEEP_MS = IMPERSONATION_STATUS_KEEP_MS;
const BACKOFF_MS = IMPERSONATION_STATUS_FAILURE_BACKOFF_MS;

/** One status read the backend got and has not answered yet. */
type PendingRead = {
    readonly bearer: string;
    answer(body: Record<string, unknown>, status?: number): void;
    fail(error: Error): void;
};

/** A backend that holds every status read until the test answers it. */
function heldBackend() {
    const reads: PendingRead[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (!url.endsWith(STATUS_PATH)) throw new Error(`unexpected backend call: ${url}`);
        return new Promise<Response>((resolve, reject) => {
            reads.push({
                bearer: String((init?.headers as Record<string, string>).Authorization),
                answer: (body, status = 200) =>
                    resolve(
                        new Response(JSON.stringify(body), {
                            status,
                            headers: { "content-type": "application/json" },
                        }),
                    ),
                fail: reject,
            });
        });
    });
    vi.stubGlobal("fetch", fetchMock);
    return reads;
}

function superuser(id: string, overrides: Token = {}): Token {
    return {
        id,
        access_token: `access-${id}`,
        refresh_token: `refresh-${id}`,
        is_superuser: true,
        expires_at: Date.now() + 3_600_000,
        last_validated: Date.now(),
        ...overrides,
    };
}

const plainRead = (id: string, overrides: Token = {}) =>
    jwt({ token: superuser(id, overrides), user: null, account: null });

/** The read the session `update()` of a start or a stop makes. */
const updateRead = (id: string, overrides: Token = {}) =>
    jwt({
        token: superuser(id, overrides),
        user: null,
        account: null,
        trigger: "update",
        session: { impersonationChanged: true },
    });

/** A token that already carries an impersonation: a failed read must leave these fields. */
const OLD_STATE = {
    is_impersonating: true,
    impersonated_user_id: "target-old",
    impersonated_email: "old@example.test",
    impersonated_org_id: "org-old",
};

const target = (name: string) => ({
    is_impersonating: true,
    target_user_id: `target-${name}`,
    target_email: `${name}@example.test`,
    target_org_id: `org-${name}`,
});
const NOT_IMPERSONATING = {
    is_impersonating: false,
    target_user_id: null,
    target_email: null,
    target_org_id: null,
};

/** Lets the callbacks run up to their backend read (or to their end). */
const settle = async () => {
    for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

beforeEach(() => {
    resetImpersonationStatusForTests();
    sessionRead.mockReset();
    // Only the clock is faked: the keep time is ended by moving `Date.now()`.
    vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("impersonation status: one shared backend read for callers that arrive together", () => {
    it("5 callers that arrive together after the keep time has ended start 1 backend read", async () => {
        const reads = heldBackend();
        const first = plainRead("shared-stale");
        await settle();
        reads[0].answer(NOT_IMPERSONATING);
        await first;
        expect(reads).toHaveLength(1);

        vi.setSystemTime(Date.now() + KEEP_MS + 1);
        const callers = Array.from({ length: 5 }, () => plainRead("shared-stale"));
        await settle();
        const started = reads.length - 1;
        for (const read of reads.slice(1)) read.answer(target("stale"));
        const tokens = await Promise.all(callers);

        expect(started).toBe(1);
        for (const token of tokens) {
            expect(token.is_impersonating).toBe(true);
            expect(token.impersonated_user_id).toBe("target-stale");
            expect(token.impersonated_email).toBe("stale@example.test");
            expect(token.impersonated_org_id).toBe("org-stale");
        }
    });

    it("5 callers that arrive together with nothing kept yet start 1 backend read", async () => {
        const reads = heldBackend();
        const callers = Array.from({ length: 5 }, () => plainRead("shared-cold"));
        await settle();
        const started = reads.length;
        for (const read of reads) read.answer(target("cold"));
        const tokens = await Promise.all(callers);

        expect(started).toBe(1);
        for (const token of tokens) expect(token.impersonated_user_id).toBe("target-cold");
    });
});

describe("(a) a status is kept and shared per user, never across users", () => {
    it("two users that arrive together each get their own read and their own status", async () => {
        const reads = heldBackend();
        const one = plainRead("user-one");
        const two = plainRead("user-two");
        await settle();

        expect(reads.map((read) => read.bearer)).toEqual([
            "Bearer access-user-one",
            "Bearer access-user-two",
        ]);
        reads[0].answer(target("one"));
        reads[1].answer(NOT_IMPERSONATING);
        expect((await one).impersonated_user_id).toBe("target-one");
        expect((await two).is_impersonating).toBe(false);
        expect((await two).impersonated_user_id).toBeUndefined();

        // Inside the keep time each user is served the status of that user, with no new read.
        const oneAgain = await plainRead("user-one");
        const twoAgain = await plainRead("user-two");
        expect(reads).toHaveLength(2);
        expect(oneAgain.impersonated_org_id).toBe("org-one");
        expect(twoAgain.is_impersonating).toBe(false);
        expect(twoAgain.impersonated_org_id).toBeUndefined();
    });

    it.each([
        ["no user id", undefined],
        ["an empty user id", ""],
    ])("a session with %s shares nothing and nothing is kept for it", async (_label, id) => {
        const reads = heldBackend();
        const first = plainRead("unused", { id, access_token: "access-first" });
        const second = plainRead("unused", { id, access_token: "access-second" });
        await settle();

        expect(reads.map((read) => read.bearer)).toEqual([
            "Bearer access-first",
            "Bearer access-second",
        ]);
        reads[0].answer(target("first"));
        reads[1].answer(NOT_IMPERSONATING);
        expect((await first).impersonated_user_id).toBe("target-first");
        expect((await second).is_impersonating).toBe(false);

        const third = plainRead("unused", { id, access_token: "access-third" });
        await settle();
        expect(reads).toHaveLength(3);
        reads[2].answer(NOT_IMPERSONATING);
        expect((await third).impersonated_user_id).toBeUndefined();
        expect(impersonationStatusKeysForTests()).toEqual([]);
    });
});

describe("(b) a failed read is not kept, and its in-flight entry is removed", () => {
    it("an answer that is not 2xx: the callers keep their state and the next caller reads again", async () => {
        const reads = heldBackend();
        const callers = Array.from({ length: 3 }, () => plainRead("user-500", OLD_STATE));
        await settle();
        expect(reads).toHaveLength(1);
        reads[0].answer({ detail: "boom" }, 500);
        for (const token of await Promise.all(callers)) expect(token).toMatchObject(OLD_STATE);

        const next = plainRead("user-500", OLD_STATE);
        await settle();
        expect(reads).toHaveLength(2);
        reads[1].answer(NOT_IMPERSONATING);
        expect((await next).is_impersonating).toBe(false);
    });

    it("a read that throws: the callers keep their state, no read for 30 s, then a new read", async () => {
        const reads = heldBackend();
        const callers = Array.from({ length: 3 }, () => plainRead("user-throw", OLD_STATE));
        await settle();
        expect(reads).toHaveLength(1);
        reads[0].fail(new Error("socket closed"));
        for (const token of await Promise.all(callers)) expect(token).toMatchObject(OLD_STATE);

        vi.setSystemTime(Date.now() + BACKOFF_MS - 1_000);
        expect(await plainRead("user-throw", OLD_STATE)).toMatchObject(OLD_STATE);
        expect(reads).toHaveLength(1);

        vi.setSystemTime(Date.now() + 1_001);
        const afterWait = plainRead("user-throw", OLD_STATE);
        await settle();
        expect(reads).toHaveLength(2);
        reads[1].answer(target("recovered"));
        expect((await afterWait).impersonated_user_id).toBe("target-recovered");
    });

    it("a good answer ends the wait that a failed read started", async () => {
        const reads = heldBackend();
        const failed = plainRead("user-recover");
        await settle();
        reads[0].fail(new Error("socket closed"));
        await failed;

        const forced = updateRead("user-recover");
        await settle();
        expect(reads).toHaveLength(2);
        reads[1].answer(target("forced"));
        expect((await forced).impersonated_user_id).toBe("target-forced");

        // The keep has ended and the 30 s of the failed read have not: the read is made.
        vi.setSystemTime(Date.now() + KEEP_MS + 1);
        const later = plainRead("user-recover");
        await settle();
        expect(reads).toHaveLength(3);
        reads[2].answer(NOT_IMPERSONATING);
        expect((await later).is_impersonating).toBe(false);
    });
});

describe("(c) a start or a stop takes effect at once for that user", () => {
    it("an update() read starts a new read while one is in flight, and the older answer is not kept", async () => {
        const reads = heldBackend();
        const before = plainRead("user-change");
        await settle();
        const forced = updateRead("user-change");
        await settle();
        expect(reads).toHaveLength(2);
        // A caller that arrives now waits for the NEWEST read.
        const joiner = plainRead("user-change");
        await settle();
        expect(reads).toHaveLength(2);

        reads[1].answer(target("new"));
        expect((await forced).impersonated_user_id).toBe("target-new");
        expect((await joiner).impersonated_user_id).toBe("target-new");
        // The read that began before the change answers last, with the state before the change.
        reads[0].answer(NOT_IMPERSONATING);
        await before;

        const after = await plainRead("user-change");
        expect(reads).toHaveLength(2);
        expect(after.is_impersonating).toBe(true);
        expect(after.impersonated_user_id).toBe("target-new");
    });

    it("an older read that fails after the newer answer starts no 30 s wait", async () => {
        const reads = heldBackend();
        const before = plainRead("user-late-failure");
        await settle();
        const forced = updateRead("user-late-failure");
        await settle();
        reads[1].answer(target("new"));
        await forced;
        reads[0].fail(new Error("socket closed"));
        await before;

        vi.setSystemTime(Date.now() + KEEP_MS + 1);
        const later = plainRead("user-late-failure");
        await settle();
        expect(reads).toHaveLength(3);
        reads[2].answer(target("later"));
        expect((await later).impersonated_user_id).toBe("target-later");
    });

    it("an update() read reads again inside the keep time", async () => {
        const reads = heldBackend();
        const first = plainRead("user-update");
        await settle();
        reads[0].answer(NOT_IMPERSONATING);
        await first;

        const forced = updateRead("user-update");
        await settle();
        expect(reads).toHaveLength(2);
        reads[1].answer(target("started"));
        expect((await forced).impersonated_user_id).toBe("target-started");
    });

    it("the start and stop actions drop what is kept, and a read in flight then is not kept", async () => {
        const reads = heldBackend();
        const first = plainRead("user-action");
        await settle();
        reads[0].answer(NOT_IMPERSONATING);
        await first;
        // The keep has ended and a read is in flight when the action ends.
        vi.setSystemTime(Date.now() + KEEP_MS + 1);
        const inFlightAtAction = plainRead("user-action");
        await settle();
        expect(reads).toHaveLength(2);

        sessionRead.mockResolvedValue({ user: { id: "user-action" }, access_token: "x" });
        await forgetOwnImpersonationStatus();

        // The next read of that user goes to the backend: it does not wait for the older read.
        const afterAction = plainRead("user-action");
        await settle();
        expect(reads).toHaveLength(3);
        reads[2].answer(target("action"));
        expect((await afterAction).impersonated_user_id).toBe("target-action");
        reads[1].answer(NOT_IMPERSONATING);
        await inFlightAtAction;

        const later = await plainRead("user-action");
        expect(reads).toHaveLength(3);
        expect(later.impersonated_user_id).toBe("target-action");
    });

    it("the action of one user leaves the kept status of another user", async () => {
        const reads = heldBackend();
        const other = plainRead("user-other");
        await settle();
        reads[0].answer(target("other"));
        await other;

        sessionRead.mockResolvedValue({ user: { id: "user-acting" }, access_token: "x" });
        await forgetOwnImpersonationStatus();

        expect((await plainRead("user-other")).impersonated_user_id).toBe("target-other");
        expect(reads).toHaveLength(1);
    });
});

describe("(d) the map does not grow without limit", () => {
    const readAndAnswer = async (reads: PendingRead[], id: string) => {
        const pending = plainRead(id);
        await settle();
        reads[reads.length - 1].answer(NOT_IMPERSONATING);
        await pending;
    };

    it("by time: an entry with nothing kept in time is removed at the next read of any user", async () => {
        const reads = heldBackend();
        await readAndAnswer(reads, "old-kept");
        const failed = plainRead("old-failed");
        await settle();
        reads[reads.length - 1].fail(new Error("socket closed"));
        await failed;
        expect(impersonationStatusKeysForTests()).toEqual(["old-kept", "old-failed"]);

        vi.setSystemTime(Date.now() + KEEP_MS + 1);
        await readAndAnswer(reads, "reader-1");
        // The kept status has ended; the 30 s wait of the failed read has not.
        expect(impersonationStatusKeysForTests()).toEqual(["old-failed", "reader-1"]);

        vi.setSystemTime(Date.now() + BACKOFF_MS);
        await readAndAnswer(reads, "reader-2");
        expect(impersonationStatusKeysForTests()).toEqual(["reader-2"]);
    });

    it("by size: above the limit the oldest entries go first, and a read in flight stays", async () => {
        const reads = heldBackend();
        const held = plainRead("held");
        await settle();
        const heldRead = reads[0];
        const extra = 10;
        for (let i = 0; i < IMPERSONATION_STATUS_MAX_USERS + extra; i += 1) {
            await readAndAnswer(reads, `user-${i}`);
        }

        const keys = impersonationStatusKeysForTests();
        expect(keys).toHaveLength(IMPERSONATION_STATUS_MAX_USERS);
        expect(keys).toContain("held");
        // `held` takes one place, so the `extra + 1` oldest of the other users are gone.
        expect(keys).not.toContain(`user-${extra}`);
        expect(keys).toContain(`user-${extra + 1}`);
        expect(keys[keys.length - 1]).toBe(`user-${IMPERSONATION_STATUS_MAX_USERS + extra - 1}`);

        heldRead.answer(target("held"));
        expect((await held).impersonated_user_id).toBe("target-held");
    });
});

describe("(e) server only", () => {
    it("in a browser the read does nothing: no backend read, no state, the token is left as it is", async () => {
        const reads = heldBackend();
        vi.stubGlobal("window", {});

        const token = await plainRead("user-browser", OLD_STATE);

        expect(reads).toHaveLength(0);
        expect(token).toMatchObject(OLD_STATE);
        expect(impersonationStatusKeysForTests()).toEqual([]);
    });

    it("the module has no client entry: only server modules import it", () => {
        const importers = sourceFiles("src")
            .filter((file) => !file.includes("__tests__") && !/\.test\.tsx?$/.test(file))
            .filter((file) =>
                /from "@\/lib\/impersonationStatusMemo"/.test(readFileSync(file, "utf8")),
            );
        expect(importers).toEqual(["src/lib/auth.ts"]);
        expect(readFileSync("src/lib/impersonationStatusMemo.ts", "utf8")).not.toMatch(
            /^["']use client["']/m,
        );
    });
});

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = `${directory}/${entry.name}`;
        if (entry.isDirectory()) return sourceFiles(path);
        return /\.tsx?$/.test(entry.name) ? [path] : [];
    });
}
