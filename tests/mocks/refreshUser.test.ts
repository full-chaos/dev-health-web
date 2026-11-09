import { getResponse } from "msw";
import { describe, expect, it } from "vitest";

import { handlers } from "./handlers";
import type { LoginResponseBody, TokenRefreshResponseBody } from "./types";

async function post<T>(path: string, body: unknown): Promise<T> {
    const response = await getResponse(
        handlers,
        new Request(`http://ops.mock.test${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
    );
    if (response === undefined) throw new Error(`no mock handler for ${path}`);
    expect(response.status).toBe(200);
    return (await response.json()) as T;
}

describe("ops mock: a refresh answers the user the sign-in answered", () => {
    it.each([
        ["the platform admin", "admin@devhealth.example", "devhealth123"],
        [
            "the platform admin with an expiring token",
            "admin-refresh@devhealth.example",
            "devhealth123",
        ],
        ["the legacy owner", "test@example.com", "password123"],
        ["the member", "member@example.com", "password123"],
        ["the orgless new user", "newuser@example.com", "password123"],
    ])(
        "Given %s signed in, then the refresh and the refresh of its rotated token answer the same user",
        async (_name, email, password) => {
            const login = await post<LoginResponseBody>("/api/v1/auth/login", { email, password });
            const first = await post<TokenRefreshResponseBody>("/api/v1/auth/refresh", {
                refresh_token: login.refresh_token,
            });
            expect(first.user).toEqual(login.user);
            const second = await post<TokenRefreshResponseBody>("/api/v1/auth/refresh", {
                refresh_token: first.refresh_token,
            });
            expect(second.user).toEqual(login.user);
        },
    );

    it("Given a fresh signup signed in, then the refresh answers that orgless user", async () => {
        const email = "refresh-signup@example.com";
        await getResponse(
            handlers,
            new Request("http://ops.mock.test/api/v1/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password: "password123" }),
            }),
        );
        const login = await post<LoginResponseBody>("/api/v1/auth/login", {
            email,
            password: "password123",
        });
        const refreshed = await post<TokenRefreshResponseBody>("/api/v1/auth/refresh", {
            refresh_token: login.refresh_token,
        });
        expect(refreshed.user).toEqual(login.user);
    });
});

describe("ops mock: a refresh token no sign-in issued keeps the old answer", () => {
    async function refresh(token: string): Promise<TokenRefreshResponseBody> {
        return post<TokenRefreshResponseBody>("/api/v1/auth/refresh", { refresh_token: token });
    }

    it("Given the onboarding pair's refresh token, then its refresh and the refresh of the token it returns both keep the old answer", async () => {
        const baseline = await refresh("never-issued-refresh-token");
        const first = await refresh("mock-onboard-refresh");
        expect(first.user).toEqual(baseline.user);
        const second = await refresh(first.refresh_token);
        expect(second.user).toEqual(baseline.user);
    });

    it.each([
        ["a signup token the mock never issued", "mock-registered-refresh-token-e2e."],
        [
            "the rotated form of a signup token the mock never issued",
            "mock-refreshed-registered-refresh-token-e2e.",
        ],
    ])("Given %s, then the refresh keeps the old answer", async (_name, prefix) => {
        const baseline = await refresh("never-issued-refresh-token");
        const forged = await refresh(
            `${prefix}${Buffer.from("attacker@example.com").toString("base64url")}`,
        );
        expect(forged.user).toEqual(baseline.user);
    });
});
