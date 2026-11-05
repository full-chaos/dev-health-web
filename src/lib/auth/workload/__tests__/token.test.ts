import { writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    BASE,
    SUBJECT_CANARY,
    TOKEN_CANARY,
    answer,
    jsonResponse,
    jwt,
    jwtRaw,
    load,
    setEnv,
    subjectFile,
} from "./harness";

const T0 = new Date("2026-11-05T00:00:00Z").getTime();
let fetchMock: ReturnType<typeof vi.fn>;
let file: string;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    file = subjectFile();
    setEnv(file);
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

const ok = (token = jwt(), expiresIn: unknown = 300) =>
    fetchMock.mockImplementation(async () => jsonResponse(answer(token, expiresIn)));

describe("exchange request", () => {
    it("sends the exact RFC 8693 form and headers", async () => {
        ok();
        const { getWorkloadToken } = await load();
        expect(await getWorkloadToken()).toBe(jwt());
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(`${BASE}/internal/v1/token/exchange`);
        expect(init.method).toBe("POST");
        expect(init.redirect).toBe("error");
        const headers = new Headers(init.headers);
        expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded");
        expect(headers.get("accept")).toBe("application/json");
        expect([...headers.keys()].sort()).toEqual(["accept", "content-type"]);
        const form = new URLSearchParams(String(init.body));
        expect([...form.keys()].sort()).toEqual([
            "audience",
            "grant_type",
            "subject_token",
            "subject_token_type",
        ]);
        expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:token-exchange");
        expect(form.get("subject_token")).toBe(SUBJECT_CANARY);
        expect(form.get("subject_token_type")).toBe("urn:ietf:params:oauth:token-type:jwt");
        expect(form.get("audience")).toBe("auth-service");
    });
    it("trims a trailing slash of the base URL", async () => {
        vi.stubEnv("AUTH_INTERNAL_URL", `${BASE}/`);
        ok();
        const { getWorkloadToken } = await load();
        await getWorkloadToken();
        expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/internal/v1/token/exchange`);
    });
});

describe("bad answers give no token and no cache", () => {
    const cases: [string, () => Response][] = [
        ["expires_in 0", () => jsonResponse(answer(jwt(), 0))],
        ["expires_in 301", () => jsonResponse(answer(jwt(), 301))],
        ["expires_in negative", () => jsonResponse(answer(jwt(), -5))],
        ["expires_in fraction", () => jsonResponse(answer(jwt(), 60.5))],
        ["expires_in string", () => jsonResponse(answer(jwt(), "60"))],
        ["expires_in missing", () => jsonResponse({ ...answer(jwt()), expires_in: undefined })],
        ["wrong iss", () => jsonResponse(answer(jwt({ iss: "https://evil.example.test" })))],
        ["wrong aud", () => jsonResponse(answer(jwt({ aud: "other" })))],
        ["aud array", () => jsonResponse(answer(jwt({ aud: ["auth-service"] })))],
        ["principal_type user", () => jsonResponse(answer(jwt({ principal_type: "user" })))],
        [
            "duplicate iss member",
            () =>
                jsonResponse(
                    answer(
                        jwtRaw(
                            `{"iss":"https://evil.example.test","iss":"https://auth.example.test","aud":"auth-service","principal_type":"workload"}`,
                        ),
                    ),
                ),
        ],
        [
            "duplicate aud member",
            () =>
                jsonResponse(
                    answer(
                        jwtRaw(
                            `{"iss":"https://auth.example.test","aud":"x","aud":"auth-service","principal_type":"workload"}`,
                        ),
                    ),
                ),
        ],
        ["not a JWT", () => jsonResponse(answer("not-a-jwt"))],
        ["token_type not Bearer", () => jsonResponse({ ...answer(jwt()), token_type: "mac" })],
        ["non-JSON body", () => jsonResponse("<html>", 200, "text/html")],
        ["malformed JSON", () => jsonResponse("{", 200)],
        ["status 400", () => jsonResponse({ error: "invalid_grant" }, 400)],
        ["status 401", () => jsonResponse(answer(jwt()), 401)],
        ["status 500", () => jsonResponse(answer(jwt()), 500)],
        ["redirect", () => new Response(null, { status: 302, headers: { location: "https://x" } })],
    ];
    it.each(cases)("%s", async (_name, reply) => {
        fetchMock.mockImplementation(async () => reply());
        const { getWorkloadToken } = await load();
        await expect(getWorkloadToken()).rejects.toThrow();
        await expect(getWorkloadToken()).rejects.toThrow();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    it("a transport error gives no token", async () => {
        fetchMock.mockRejectedValue(new TypeError("fetch failed"));
        const { getWorkloadToken } = await load();
        await expect(getWorkloadToken()).rejects.toThrow();
    });
    it("expires_in 1 and 300 are accepted bounds; expires_in inside the margin is unusable", async () => {
        ok(jwt(), 300);
        const { getWorkloadToken } = await load();
        await expect(getWorkloadToken()).resolves.toBe(jwt());
        const second = await load();
        ok(jwt(), 30);
        await expect(second.getWorkloadToken()).rejects.toThrow();
    });
});

describe("cache window", () => {
    it("serves the cache before half life and exchanges again at half life", async () => {
        const first = jwt({}, "tok-canary-first");
        const second = jwt({}, "tok-canary-second");
        let n = 0;
        fetchMock.mockImplementation(async () =>
            jsonResponse(answer(++n === 1 ? first : second, 200)),
        );
        const { getWorkloadToken } = await load();
        expect(await getWorkloadToken()).toBe(first);
        vi.setSystemTime(T0 + 99_000);
        expect(await getWorkloadToken()).toBe(first);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        vi.setSystemTime(T0 + 100_000);
        expect(await getWorkloadToken()).toBe(second);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    it("never returns a token inside the 30 s safety margin", async () => {
        ok(jwt(), 100);
        const { getWorkloadToken } = await load();
        await getWorkloadToken();
        fetchMock.mockRejectedValue(new TypeError("down"));
        vi.setSystemTime(T0 + 69_000);
        await expect(getWorkloadToken()).resolves.toBe(jwt());
        vi.setSystemTime(T0 + 70_000);
        await expect(getWorkloadToken()).rejects.toThrow();
    });
    it("a failed refresh keeps the still-usable cached token", async () => {
        ok(jwt(), 100);
        const { getWorkloadToken } = await load();
        await getWorkloadToken();
        fetchMock.mockResolvedValue(jsonResponse({}, 500));
        vi.setSystemTime(T0 + 50_000);
        await expect(getWorkloadToken()).resolves.toBe(jwt());
    });
});

describe("single flight", () => {
    it("20 concurrent callers share one exchange", async () => {
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        fetchMock.mockImplementation(async () => {
            await gate;
            return jsonResponse(answer(jwt()));
        });
        const { getWorkloadToken } = await load();
        const calls = Array.from({ length: 20 }, () => getWorkloadToken());
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        release();
        const tokens = await Promise.all(calls);
        expect(new Set(tokens)).toEqual(new Set([jwt()]));
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it("a failed flight does not stick: the next caller exchanges again", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
        ok();
        const { getWorkloadToken } = await load();
        await expect(getWorkloadToken()).rejects.toThrow();
        await expect(getWorkloadToken()).resolves.toBe(jwt());
    });
});

describe("subject file", () => {
    it("is re-read on every exchange (kubelet rotation)", async () => {
        ok(jwt(), 100);
        const { getWorkloadToken } = await load();
        await getWorkloadToken();
        writeFileSync(file, "rotated-subject-canary.second.third\n");
        vi.setSystemTime(T0 + 50_000);
        await getWorkloadToken();
        const forms = fetchMock.mock.calls.map((c) => new URLSearchParams(String(c[1].body)));
        expect(forms.map((f) => f.get("subject_token"))).toEqual([
            SUBJECT_CANARY,
            "rotated-subject-canary.second.third",
        ]);
    });
    it("an unreadable or empty file gives an error and no request", async () => {
        writeFileSync(file, "\n");
        const { getWorkloadToken } = await load();
        await expect(getWorkloadToken()).rejects.toThrow();
        vi.stubEnv("AUTH_WORKLOAD_SUBJECT_FILE", `${file}.missing`);
        await expect(getWorkloadToken()).rejects.toThrow();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("env", () => {
    it.each(["AUTH_INTERNAL_URL", "AUTH_WORKLOAD_SUBJECT_FILE", "AUTH_WORKLOAD_ISSUER"])(
        "%s unset = no token source and no fetch",
        async (name) => {
            vi.stubEnv(name, "");
            ok();
            const { getWorkloadToken } = await load();
            expect(await getWorkloadToken()).toBeUndefined();
            expect(fetchMock).not.toHaveBeenCalled();
        },
    );
    it("an http issuer is no token source", async () => {
        vi.stubEnv("AUTH_WORKLOAD_ISSUER", "http://auth.example.test");
        ok();
        const { getWorkloadToken } = await load();
        expect(await getWorkloadToken()).toBeUndefined();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("a failed exchange stops the caller", () => {
    it("the caller gets an error and no downstream request is sent; no other credential is used", async () => {
        const downstream = vi.fn();
        fetchMock.mockImplementation(async (url: string) => {
            if (String(url).endsWith("/internal/v1/token/exchange"))
                return jsonResponse({ error: "invalid_grant" }, 400);
            downstream(url);
            return jsonResponse({});
        });
        const { getWorkloadToken } = await load();
        const consumer = async () => {
            const token = await getWorkloadToken();
            await fetch(`${BASE}/v1/authorize`, { headers: { authorization: `Bearer ${token}` } });
        };
        await expect(consumer()).rejects.toThrow();
        expect(downstream).not.toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        for (const [, init] of fetchMock.mock.calls) {
            expect(JSON.stringify(init)).not.toMatch(/authorization/i);
        }
    });
});

describe("errors carry no token or subject bytes", () => {
    it("across failure classes", async () => {
        const replies = [
            () => jsonResponse(answer(jwt({ iss: "https://evil.example.test" }), 300)),
            () => jsonResponse(answer(jwt(), 9999)),
            () => jsonResponse(`${TOKEN_CANARY} ${SUBJECT_CANARY}`, 500, "text/plain"),
            () => {
                throw new TypeError(`fetch failed ${SUBJECT_CANARY} ${TOKEN_CANARY}`);
            },
        ];
        for (const reply of replies) {
            fetchMock.mockImplementation(async () => reply());
            const { getWorkloadToken } = await load();
            const err = await getWorkloadToken().then(
                () => null,
                (e) => e,
            );
            expect(err).toBeInstanceOf(Error);
            const text = [
                String(err),
                err.message,
                err.stack ?? "",
                JSON.stringify(err, Object.getOwnPropertyNames(err)),
            ].join("\n");
            expect(text).not.toContain(TOKEN_CANARY);
            expect(text).not.toContain("subj-canary");
        }
    });
});
