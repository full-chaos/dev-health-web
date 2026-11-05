import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    SUBJECT_CANARY,
    TOKEN_CANARY,
    answer,
    jsonResponse,
    jwt,
    load,
    setEnv,
    subjectFile,
} from "./harness";

const logCalls: unknown[][] = [];
vi.mock("@/lib/logger", () => {
    const rec =
        () =>
        (...a: unknown[]) => {
            logCalls.push(a);
        };
    const logger = {
        trace: rec(),
        debug: rec(),
        info: rec(),
        warn: rec(),
        error: rec(),
        fatal: rec(),
        child: () => logger,
    };
    return { logger };
});

let fetchMock: ReturnType<typeof vi.fn>;
const consoleSpies: ReturnType<typeof vi.spyOn>[] = [];

beforeEach(() => {
    logCalls.length = 0;
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    setEnv(subjectFile());
    for (const m of ["log", "info", "warn", "error", "debug", "trace"] as const)
        consoleSpies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
});
afterEach(() => {
    consoleSpies.length = 0;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

function seen(): string {
    const all = [
        ...logCalls,
        ...vi.mocked(console.log).mock.calls,
        ...vi.mocked(console.info).mock.calls,
        ...vi.mocked(console.warn).mock.calls,
        ...vi.mocked(console.error).mock.calls,
        ...vi.mocked(console.debug).mock.calls,
        ...vi.mocked(console.trace).mock.calls,
    ];
    return JSON.stringify(all, (_k, v) => (v instanceof Error ? { m: v.message, s: v.stack } : v));
}

describe("the token and the subject are never logged or printed", () => {
    it("success path", async () => {
        fetchMock.mockImplementation(async () => jsonResponse(answer(jwt())));
        const { getWorkloadToken } = await load();
        await getWorkloadToken();
        await getWorkloadToken();
        expect(seen()).not.toContain(TOKEN_CANARY);
        expect(seen()).not.toContain("subj-canary");
    });
    it.each([
        ["bad claims", () => jsonResponse(answer(jwt({ aud: "x" })))],
        ["bad expires_in", () => jsonResponse(answer(jwt(), 999))],
        [
            "status 500 echoing secrets",
            () => jsonResponse(`${TOKEN_CANARY} ${SUBJECT_CANARY}`, 500),
        ],
        [
            "fetch throws with secrets",
            () => {
                throw new TypeError(`boom ${TOKEN_CANARY} ${SUBJECT_CANARY}`);
            },
        ],
    ])("error path: %s", async (_n, reply) => {
        fetchMock.mockImplementation(async () => reply());
        const { getWorkloadToken } = await load();
        await getWorkloadToken().catch(() => undefined);
        expect(seen()).not.toContain(TOKEN_CANARY);
        expect(seen()).not.toContain("subj-canary");
        expect(seen()).not.toContain(Buffer.from(SUBJECT_CANARY).toString("base64"));
    });
});
