import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CHAOS-8443: every branch that takes a token away from a session, or keeps a
// session on a fallback, writes one warn line that names the branch. The line
// never carries a token, an e-mail address or text the backend served.

const { nextAuthConfig, warn } = vi.hoisted(() => ({
    nextAuthConfig: { value: null as unknown },
    warn: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("next-auth", () => ({
    default: vi.fn((config: unknown) => {
        nextAuthConfig.value = config;
        return {
            auth: vi.fn(),
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

vi.mock("@/lib/logger", () => {
    const child = (): Record<string, unknown> => ({
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn,
        error: vi.fn(),
        fatal: vi.fn(),
        child,
    });
    return { logger: child() };
});

import "@/lib/auth";
import { logSessionBranch } from "@/lib/authSessionLog";
import { resetValidationMemoForTests } from "@/lib/authValidationMemo";

const ACCESS_TOKEN = "access-token-must-not-be-logged";
const REFRESH_TOKEN = "refresh-token-must-not-be-logged";
const EMAIL = "person@example.test";
const SERVED_TEXT = "served-error-text-must-not-be-logged";
const ALLOWED_FIELDS = ["operation", "branch", "status", "errorName", "failures"];

type Token = Record<string, unknown>;
type JwtCallback = (params: { token: Token; user?: unknown; account?: unknown }) => Promise<Token>;

function jwtCallback(): JwtCallback {
    const config = nextAuthConfig.value as { callbacks?: { jwt?: JwtCallback } } | null;
    const jwt = config?.callbacks?.jwt;
    if (!jwt) throw new Error("JWT callback not captured from NextAuth config");
    return jwt;
}

/** A token whose access token is past its refresh point: the refresh branch runs. */
function refreshDueToken(): Token {
    return {
        id: "user-1",
        email: EMAIL,
        access_token: ACCESS_TOKEN,
        refresh_token: REFRESH_TOKEN,
        expires_at: Date.now() - 1000,
        last_validated: Date.now(),
    };
}

/** A fresh token whose last validation is older than the interval: validation runs. */
function validationDueToken(): Token {
    return {
        id: "user-1",
        email: EMAIL,
        access_token: ACCESS_TOKEN,
        refresh_token: REFRESH_TOKEN,
        expires_at: Date.now() + 60 * 60 * 1000,
        last_validated: Date.now() - 6 * 60 * 1000,
    };
}

function backendAnswers(status: number, body: unknown = { detail: SERVED_TEXT }): void {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify(body), { status })),
    );
}

function backendThrows(): void {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
            throw new TypeError(`fetch failed: ${SERVED_TEXT}`);
        }),
    );
}

/** The fields of every session-branch line written so far. */
function branchLines(): Array<Record<string, unknown>> {
    return warn.mock.calls
        .map(([fields]) => fields as Record<string, unknown>)
        .filter((fields) => typeof fields === "object" && fields !== null && "branch" in fields);
}

async function run(token: Token): Promise<Token> {
    return jwtCallback()({ token, account: null });
}

beforeEach(() => {
    warn.mockReset();
    resetValidationMemoForTests();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("refresh branches name themselves in the log", () => {
    it("refresh_failed: a 401 on the refresh token ends the session", async () => {
        backendAnswers(401);

        const token = await run(refreshDueToken());

        expect(token.error).toBe("refresh_failed");
        expect(branchLines()).toEqual([
            { operation: "refresh", branch: "refresh_failed", status: 401 },
        ]);
    });

    it.each([429, 500, 503, 404])(
        "refresh_unavailable: status %i drops the access token and keeps the refresh token",
        async (status) => {
            backendAnswers(status);

            const token = await run(refreshDueToken());

            expect(token.error).toBe("refresh_unavailable");
            expect(token.refresh_token).toBe(REFRESH_TOKEN);
            expect(branchLines()).toEqual([
                { operation: "refresh", branch: "refresh_unavailable", status, failures: 1 },
            ]);
        },
    );

    it("refresh_unavailable counts consecutive failures", async () => {
        backendAnswers(429);

        await run({ ...refreshDueToken(), refresh_failures: 2 });

        expect(branchLines()).toEqual([
            { operation: "refresh", branch: "refresh_unavailable", status: 429, failures: 3 },
        ]);
    });

    it("refresh_call_failed: a thrown refresh call logs the error name, not its message", async () => {
        backendThrows();

        const token = await run(refreshDueToken());

        expect(token.error).toBe("refresh_unavailable");
        expect(branchLines()).toEqual([
            {
                operation: "refresh",
                branch: "refresh_call_failed",
                errorName: "TypeError",
                failures: 1,
            },
        ]);
    });

    it("refresh_no_access_token: a 2xx answer with no access token is named", async () => {
        backendAnswers(200, { refresh_token: "next-refresh" });

        const token = await run(refreshDueToken());

        expect(token.access_token).toBeUndefined();
        expect(token.error).toBeUndefined();
        expect(branchLines()).toEqual([
            { operation: "refresh", branch: "refresh_no_access_token", status: 200 },
        ]);
    });

    it("a refresh that succeeds writes no branch line", async () => {
        backendAnswers(200, { access_token: "next-access", refresh_token: "next-refresh" });

        const token = await run(refreshDueToken());

        expect(token.error).toBeUndefined();
        expect(branchLines()).toEqual([]);
    });
});

describe("validation branches name themselves in the log", () => {
    it("user_invalid: a 200 with valid false ends the session", async () => {
        backendAnswers(200, { valid: false });

        const token = await run(validationDueToken());

        expect(token.error).toBe("user_invalid");
        expect(branchLines()).toEqual([
            { operation: "validate", branch: "user_invalid", status: 200 },
        ]);
    });

    it.each([401, 403])(
        "user_invalid: status %i ends the session and the line shows the status",
        async (status) => {
            backendAnswers(status);

            const token = await run(validationDueToken());

            expect(token.error).toBe("user_invalid");
            expect(branchLines()).toEqual([
                { operation: "validate", branch: "user_invalid", status },
            ]);
        },
    );

    it.each([400, 404, 422, 429, 500, 503])(
        "validate_transient: status %i keeps the session and says so",
        async (status) => {
            backendAnswers(status);

            const token = await run(validationDueToken());

            expect(token.error).toBeUndefined();
            expect(token.access_token).toBe(ACCESS_TOKEN);
            expect(branchLines()).toEqual([
                { operation: "validate", branch: "validate_transient", status, failures: 1 },
            ]);
        },
    );

    it.each([
        ["an empty object", "{}"],
        ["valid as a string", JSON.stringify({ valid: "false" })],
        ["a JSON null", "null"],
        ["a body that is not JSON", "<html>bad gateway</html>"],
    ])("validate_transient: a 200 with %s is logged with its status", async (_name, body) => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(body, { status: 200 })),
        );

        const token = await run(validationDueToken());

        expect(token.error).toBeUndefined();
        expect(token.access_token).toBe(ACCESS_TOKEN);
        expect(branchLines()).toEqual([
            { operation: "validate", branch: "validate_transient", status: 200, failures: 1 },
        ]);
    });

    it("validate_call_failed: a thrown validation call keeps the session and logs the error name", async () => {
        backendThrows();

        const token = await run(validationDueToken());

        expect(token.error).toBeUndefined();
        expect(token.access_token).toBe(ACCESS_TOKEN);
        expect(branchLines()).toEqual([
            {
                operation: "validate",
                branch: "validate_call_failed",
                errorName: "TypeError",
                failures: 1,
            },
        ]);
    });

    it("a validation that confirms the user writes no branch line", async () => {
        backendAnswers(200, { valid: true });

        const token = await run(validationDueToken());

        expect(token.error).toBeUndefined();
        expect(branchLines()).toEqual([]);
    });
});

describe("a branch line never carries a secret", () => {
    const cases: Array<[string, () => Token, () => void]> = [
        ["refresh 401", refreshDueToken, () => backendAnswers(401)],
        ["refresh 429", refreshDueToken, () => backendAnswers(429)],
        ["refresh throws", refreshDueToken, backendThrows],
        [
            "refresh 200 without an access token",
            refreshDueToken,
            () => backendAnswers(200, { refresh_token: REFRESH_TOKEN, detail: SERVED_TEXT }),
        ],
        ["validate valid false", validationDueToken, () => backendAnswers(200, { valid: false })],
        ["validate 404", validationDueToken, () => backendAnswers(404)],
        ["validate 503", validationDueToken, () => backendAnswers(503)],
        ["validate throws", validationDueToken, backendThrows],
    ];

    it.each(cases)("%s", async (_name, makeToken, arrange) => {
        arrange();

        await run(makeToken());

        expect(branchLines()).toHaveLength(1);
        const written = JSON.stringify(warn.mock.calls);
        for (const secret of [ACCESS_TOKEN, REFRESH_TOKEN, EMAIL, SERVED_TEXT]) {
            expect(written).not.toContain(secret);
        }
        for (const fields of branchLines()) {
            for (const key of Object.keys(fields)) {
                expect(ALLOWED_FIELDS).toContain(key);
            }
        }
    });
});

describe("only the five named fields are written", () => {
    it("drops a field that is not one of the five", () => {
        logSessionBranch({
            operation: "refresh",
            branch: "refresh_failed",
            status: 401,
            token: REFRESH_TOKEN,
        } as never);

        expect(warn.mock.calls.map(([fields]) => fields)).toStrictEqual([
            { operation: "refresh", branch: "refresh_failed", status: 401 },
        ]);
    });

    it("writes no key for a field that is absent", () => {
        logSessionBranch({ operation: "validate", branch: "user_invalid", status: 200 });

        expect(Object.keys(warn.mock.calls[0][0] as object).sort()).toEqual([
            "branch",
            "operation",
            "status",
        ]);
    });
});

describe("a logger that throws never changes what happens to the session", () => {
    /** The token after the JWT callback, with a working logger and then with one that throws. */
    async function bothWays(makeToken: () => Token, arrange: () => void): Promise<[Token, Token]> {
        arrange();
        const quiet = await run(makeToken());

        resetValidationMemoForTests();
        warn.mockImplementation(() => {
            throw new Error("logger is down");
        });
        arrange();
        const loud = await run(makeToken());

        return [quiet, loud];
    }

    /** The parts of a token that decide what the session holds. */
    function held(token: Token): Record<string, unknown> {
        return {
            access_token: token.access_token,
            refresh_token: token.refresh_token,
            error: token.error,
            refresh_failures: token.refresh_failures,
            validation_failures: token.validation_failures,
        };
    }

    const cases: Array<[string, () => Token, () => void, string | undefined]> = [
        ["refresh 401", refreshDueToken, () => backendAnswers(401), "refresh_failed"],
        ["refresh 429", refreshDueToken, () => backendAnswers(429), "refresh_unavailable"],
        ["refresh throws", refreshDueToken, backendThrows, "refresh_unavailable"],
        [
            "refresh 200 without an access token",
            refreshDueToken,
            () => backendAnswers(200, { refresh_token: "next-refresh" }),
            undefined,
        ],
        [
            "validate valid false",
            validationDueToken,
            () => backendAnswers(200, { valid: false }),
            "user_invalid",
        ],
        ["validate 401", validationDueToken, () => backendAnswers(401), "user_invalid"],
        ["validate 404", validationDueToken, () => backendAnswers(404), undefined],
        ["validate 503", validationDueToken, () => backendAnswers(503), undefined],
        ["validate throws", validationDueToken, backendThrows, undefined],
    ];

    it.each(cases)("%s", async (_name, makeToken, arrange, expectedError) => {
        const [quiet, loud] = await bothWays(makeToken, arrange);

        expect(quiet.error).toBe(expectedError);
        expect(held(loud)).toEqual(held(quiet));
    });
});
