import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    classifyLogin,
    classifyLogout,
    classifyRefresh,
    inFlightRefreshKeys,
    serviceBearer,
    singleFlightRefresh,
} from "@/lib/authServiceOutcome";

const user = {
    id: "u1",
    email: "a@example.test",
    org_id: "o1",
    role: "admin",
    is_superuser: false,
};
const loginBody = {
    access_token: "acc-1",
    refresh_token: "ref-1",
    token_type: "bearer",
    expires_in: 3600,
    needs_onboarding: false,
    user,
};
const refreshBody = { access_token: "acc-2", refresh_token: "ref-2", expires_in: 3600, user };

describe("classifyLogin", () => {
    it("login 200 maps tokens, user and needs_onboarding", () => {
        const got = classifyLogin({ status: 200, body: { ...loginBody, needs_onboarding: true } });
        expect(got).toEqual({
            kind: "ok",
            accessToken: "acc-1",
            refreshToken: "ref-1",
            expiresIn: 3600,
            needsOnboarding: true,
            sessionAccessToken: undefined,
            user: {
                id: "u1",
                email: "a@example.test",
                orgId: "o1",
                role: "admin",
                isSuperuser: false,
            },
        });
    });

    it("login 200 passes the session_access_token on unread, for the class rules", () => {
        const got = classifyLogin({
            status: 200,
            body: { ...loginBody, session_access_token: "svc-1" },
        });
        expect(got).toMatchObject({ kind: "ok", sessionAccessToken: "svc-1" });
    });

    it("login 401 is invalid credentials", () => {
        expect(
            classifyLogin({ status: 401, body: { detail: { message: "Invalid credentials" } } }),
        ).toEqual({
            kind: "invalid_credentials",
        });
    });

    it("login 400, 403, 404 and 422 are invalid credentials", () => {
        for (const status of [400, 403, 404, 422]) {
            expect(classifyLogin({ status, body: null }), String(status)).toEqual({
                kind: "invalid_credentials",
            });
        }
    });

    it("login 429 with retry_after_seconds is account_locked", () => {
        const body = { detail: { message: "locked", retry_after_seconds: 30 } };
        expect(classifyLogin({ status: 429, body })).toEqual({ kind: "account_locked" });
    });

    it("login 429 without retry_after_seconds is rate_limited", () => {
        expect(classifyLogin({ status: 429, body: { detail: { message: "slow down" } } })).toEqual({
            kind: "rate_limited",
        });
        expect(classifyLogin({ status: 429, body: null })).toEqual({ kind: "rate_limited" });
        expect(
            classifyLogin({ status: 429, body: { detail: { retry_after_seconds: "30" } } }),
        ).toEqual({
            kind: "rate_limited",
        });
    });

    it("login 200 email_verification_required", () => {
        expect(
            classifyLogin({
                status: 200,
                body: { status: "email_verification_required", email: "a@example.test" },
            }),
        ).toEqual({ kind: "email_verification_required" });
    });

    it("login 503, 500, 408, 425 and a thrown call are unavailable, not invalid credentials", () => {
        for (const status of [408, 425, 500, 502, 503, 504]) {
            expect(classifyLogin({ status, body: null }), String(status)).toEqual({
                kind: "unavailable",
            });
        }
        expect(classifyLogin({ thrown: true })).toEqual({ kind: "unavailable" });
    });

    it("login 200 without both tokens or without a user id is an invalid response", () => {
        const bad = [
            { ...loginBody, access_token: undefined },
            { ...loginBody, refresh_token: undefined },
            { ...loginBody, access_token: "" },
            { ...loginBody, user: undefined },
            { ...loginBody, user: { ...user, id: "" } },
            null,
            "text",
        ];
        for (const body of bad) {
            expect(classifyLogin({ status: 200, body }), JSON.stringify(body)).toEqual({
                kind: "invalid_response",
            });
        }
    });
});

describe("classifyRefresh", () => {
    it("refresh 200 stores the rotated refresh token and expires_in", () => {
        expect(classifyRefresh({ status: 200, body: refreshBody })).toEqual({
            kind: "rotated",
            accessToken: "acc-2",
            refreshToken: "ref-2",
            expiresIn: 3600,
            sessionAccessToken: undefined,
            user: {
                id: "u1",
                email: "a@example.test",
                orgId: "o1",
                role: "admin",
                isSuperuser: false,
            },
        });
    });

    it("refresh 401 is terminal", () => {
        expect(classifyRefresh({ status: 401, body: null })).toEqual({
            kind: "terminal",
            reason: "status",
            status: 401,
        });
    });

    it("refresh 400, 403, 404, 410 and 422 are terminal", () => {
        for (const status of [400, 403, 404, 410, 422]) {
            expect(classifyRefresh({ status, body: null }), String(status)).toEqual({
                kind: "terminal",
                reason: "status",
                status,
            });
        }
    });

    it("refresh 429, 408, 425, 500, 502, 503, 504 and a thrown call are transient", () => {
        for (const status of [408, 425, 429, 500, 502, 503, 504]) {
            expect(classifyRefresh({ status, body: null }), String(status)).toEqual({
                kind: "transient",
                status,
            });
        }
        expect(classifyRefresh({ thrown: true })).toEqual({ kind: "transient" });
    });

    it("refresh 200 without refresh_token is terminal and never keeps the spent token", () => {
        const got = classifyRefresh({
            status: 200,
            body: { ...refreshBody, refresh_token: undefined },
        });
        expect(got).toEqual({ kind: "terminal", reason: "invalid_response" });
        expect(
            classifyRefresh({ status: 200, body: { ...refreshBody, refresh_token: "" } }),
        ).toEqual(got);
        expect(
            classifyRefresh({ status: 200, body: { ...refreshBody, refresh_token: 7 } }),
        ).toEqual(got);
    });

    it("refresh 200 without access_token is terminal", () => {
        for (const access_token of [undefined, "", null, 7]) {
            expect(
                classifyRefresh({ status: 200, body: { ...refreshBody, access_token } }),
            ).toEqual({
                kind: "terminal",
                reason: "invalid_response",
            });
        }
        expect(classifyRefresh({ status: 200, body: null })).toEqual({
            kind: "terminal",
            reason: "invalid_response",
        });
    });

    it("refresh answers carry a closed shape and never body text", () => {
        const got = classifyRefresh({
            status: 200,
            body: { ...refreshBody, refresh_token: undefined, note: "secret-note" },
        });
        expect(JSON.stringify(got)).not.toContain("secret-note");
        expect(JSON.stringify(got)).not.toContain("acc-2");
    });

    it("an unusual expires_in is dropped, not trusted", () => {
        for (const expires_in of [0, -5, 1.5, "3600", null]) {
            const got = classifyRefresh({ status: 200, body: { ...refreshBody, expires_in } });
            expect(got).toMatchObject({ kind: "rotated" });
            expect(got).not.toHaveProperty("expiresIn");
        }
    });
});

describe("classifyLogout", () => {
    it("logout 200 is revoked", () => {
        expect(classifyLogout({ status: 200, body: { message: "ok" } })).toEqual({
            kind: "revoked",
        });
    });

    it("logout 5xx, 4xx and a thrown call are failed", () => {
        for (const status of [400, 401, 429, 500, 503]) {
            expect(classifyLogout({ status, body: null }), String(status)).toEqual({
                kind: "failed",
            });
        }
        expect(classifyLogout({ thrown: true })).toEqual({ kind: "failed" });
    });
});

describe("singleFlightRefresh", () => {
    it("parallel refreshes of one refresh token make one backend call", async () => {
        let calls = 0;
        let release: (v: string) => void = () => {};
        const call = () => {
            calls += 1;
            return new Promise<string>((resolve) => (release = resolve));
        };
        const a = singleFlightRefresh("ref-one", call);
        const b = singleFlightRefresh("ref-one", call);
        const c = singleFlightRefresh("ref-one", call);
        release("rotated");
        expect(await Promise.all([a, b, c])).toEqual(["rotated", "rotated", "rotated"]);
        expect(calls).toBe(1);
    });

    it("different refresh tokens are not shared", async () => {
        let calls = 0;
        const call = async () => ++calls;
        const got = await Promise.all([
            singleFlightRefresh("ref-x", call),
            singleFlightRefresh("ref-y", call),
        ]);
        expect(calls).toBe(2);
        expect(got.sort()).toEqual([1, 2]);
    });

    it("the entry is released once the call settles, success or failure", async () => {
        let calls = 0;
        await singleFlightRefresh("ref-z", async () => ++calls);
        await singleFlightRefresh("ref-z", async () => ++calls);
        expect(calls).toBe(2);
        await expect(
            singleFlightRefresh("ref-z", async () => {
                throw new Error("boom");
            }),
        ).rejects.toThrow("boom");
        expect(await singleFlightRefresh("ref-z", async () => "again")).toBe("again");
        expect(inFlightRefreshKeys()).toEqual([]);
    });

    it("waiters of a failed call all see the failure", async () => {
        let reject: (e: Error) => void = () => {};
        const call = () => new Promise<string>((_, r) => (reject = r));
        const a = singleFlightRefresh("ref-f", call);
        const b = singleFlightRefresh("ref-f", call);
        reject(new Error("down"));
        await expect(a).rejects.toThrow("down");
        await expect(b).rejects.toThrow("down");
    });

    it("the key is a hash: the registry never holds the refresh token", async () => {
        let release: (v: string) => void = () => {};
        const pending = singleFlightRefresh(
            "ref-secret-value",
            () => new Promise<string>((r) => (release = r)),
        );
        const keys = inFlightRefreshKeys();
        expect(keys).toHaveLength(1);
        expect(keys[0]).toMatch(/^[0-9a-f]{64}$/);
        expect(keys[0]).not.toContain("ref-secret-value");
        release("done");
        await pending;
    });
});

describe("serviceBearer", () => {
    it("serviceBearer is session_access_token when present, else access_token", () => {
        expect(serviceBearer({ access_token: "acc", session_access_token: "svc" })).toBe("svc");
        expect(serviceBearer({ access_token: "acc" })).toBe("acc");
        expect(serviceBearer({ access_token: "acc", session_access_token: undefined })).toBe("acc");
    });

    it("an empty or non-string session_access_token falls back to access_token", () => {
        for (const value of ["", 7, null, {}]) {
            expect(serviceBearer({ access_token: "acc", session_access_token: value })).toBe("acc");
        }
    });

    it("no token at all gives no bearer", () => {
        expect(serviceBearer({})).toBeUndefined();
        expect(serviceBearer({ access_token: "" })).toBeUndefined();
    });
});

describe("module hygiene", () => {
    it("never logs or reads env, and imports no logger", () => {
        const text = readFileSync(path.resolve(__dirname, "../authServiceOutcome.ts"), "utf8");
        expect(text).not.toMatch(/process\.env|console\.|logger/);
    });
});
