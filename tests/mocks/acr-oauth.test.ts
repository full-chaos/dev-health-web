import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
    ACR_DEV_BROWSER_CLIENT_ID,
    ACR_FAMILY_LIFETIME_MS,
    ACR_REFRESH_GRACE_MS,
    AcrOAuthMock,
} from "./acr-oauth";
import capture from "./acr-oauth.capture.json";

/**
 * The browser OAuth mock (CHAOS-12303) against acr-api's own answers. With the captured issuer and
 * redirect, a captured request must get the captured response, byte for byte. Then the mock's
 * rules for codes and refresh tokens are pinned, as acr's producer states them.
 */

const ISSUER = capture.metadata.body.issuer;
const REDIRECT = "http://localhost:3000/ask-dev/oauth/callback";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

function mock(now = { t: 1_800_000_000_000 }) {
    return {
        clock: now,
        acr: new AcrOAuthMock({ issuer: ISSUER, redirectUri: REDIRECT, now: () => now.t }),
    };
}

function authorizeUrl(change: Record<string, string> = {}) {
    const url = new URL(`${ISSUER}/authorize`);
    const params = {
        response_type: "code",
        client_id: ACR_DEV_BROWSER_CLIENT_ID,
        redirect_uri: REDIRECT,
        code_challenge: CHALLENGE,
        code_challenge_method: "S256",
        state: "s".repeat(43),
        resource: ISSUER,
        scope: "context:read evidence:read",
        ...change,
    };
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url.href;
}

function tokenForm(values: Record<string, string>) {
    return new URLSearchParams(values).toString();
}

function codeFrom(acr: AcrOAuthMock) {
    const answer = acr.handle({ method: "GET", url: authorizeUrl() });
    return new URL(answer.headers.Location!).searchParams.get("code")!;
}

function exchange(acr: AcrOAuthMock, code: string, change: Record<string, string> = {}) {
    return acr.handle({
        method: "POST",
        url: `${ISSUER}/token`,
        body: tokenForm({
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT,
            client_id: ACR_DEV_BROWSER_CLIENT_ID,
            code_verifier: VERIFIER,
            resource: ISSUER,
            ...change,
        }),
    });
}

function refresh(acr: AcrOAuthMock, token: string) {
    return acr.handle({
        method: "POST",
        url: `${ISSUER}/token`,
        body: tokenForm({
            grant_type: "refresh_token",
            refresh_token: token,
            client_id: ACR_DEV_BROWSER_CLIENT_ID,
        }),
    });
}

describe("the mock answers what acr-api answered (captured on askdev-1)", () => {
    it("serves the captured metadata", () => {
        const { acr } = mock();
        const answer = acr.handle({
            method: "GET",
            url: `${ISSUER}/.well-known/oauth-authorization-server`,
        });
        expect(answer.status).toBe(capture.metadata.status);
        expect(answer.headers).toEqual(capture.metadata.headers);
        expect(JSON.parse(answer.body)).toEqual(capture.metadata.body);
    });

    it("rebases the captured metadata onto another issuer, and changes nothing else", () => {
        const acr = new AcrOAuthMock({ issuer: "http://127.0.0.1:3100", redirectUri: REDIRECT });
        const body = JSON.parse(
            acr.handle({
                method: "GET",
                url: "http://127.0.0.1:3100/.well-known/oauth-authorization-server",
            }).body,
        );
        expect(JSON.stringify(body)).toBe(
            JSON.stringify(capture.metadata.body).replaceAll(ISSUER, "http://127.0.0.1:3100"),
        );
    });

    it("gives the captured authorize error redirect for the captured request", () => {
        const { acr } = mock();
        const captured = new URL(capture.source.commands.authorize_error.match(/'([^']+)'/u)![1]!);
        const answer = acr.handle({
            method: "GET",
            url: captured.href.replace("http://acr.localhost:3000", ISSUER),
        });
        expect(answer.status).toBe(capture.authorize_error.status);
        expect(answer.headers).toEqual(capture.authorize_error.headers);
    });

    it("gives the captured invalid_grant for an unknown code and an unknown refresh token", () => {
        const { acr } = mock();
        const unknownCode = exchange(acr, "capturecode00000000000000000000000000000000");
        expect(unknownCode.status).toBe(capture.token_invalid_grant.status);
        expect(JSON.parse(unknownCode.body)).toEqual(capture.token_invalid_grant.body);
        for (const [key, value] of Object.entries(unknownCode.headers)) {
            expect(capture.token_invalid_grant.headers).toHaveProperty(key, value);
        }
        const unknownRefresh = refresh(acr, "acrrt_capturerefresh00000000000000000000000000000");
        expect(unknownRefresh.status).toBe(capture.refresh_invalid_grant.status);
        expect(JSON.parse(unknownRefresh.body)).toEqual(capture.refresh_invalid_grant.body);
    });
});

describe("the mock keeps acr's rules", () => {
    it("puts iss and state on the success redirect, keys sorted like Go's url.Values", () => {
        const { acr } = mock();
        const location = acr.handle({ method: "GET", url: authorizeUrl() }).headers.Location!;
        expect(location).toMatch(
            new RegExp(
                `^${REDIRECT}\\?code=[A-Za-z0-9_-]{43}&iss=https%3A%2F%2Facr\\.localhost&state=s{43}$`,
                "u",
            ),
        );
    });

    it("issues acr's token body shape for a good code", () => {
        const { acr } = mock();
        const answer = exchange(acr, codeFrom(acr));
        expect(answer.status).toBe(200);
        expect(JSON.parse(answer.body)).toEqual({
            access_token: expect.stringMatching(/^fcacr_[A-Za-z0-9_-]{43}$/u),
            token_type: "Bearer",
            expires_in: 600,
            scope: "context:read evidence:read",
            refresh_token: expect.stringMatching(/^acrrt_[A-Za-z0-9_-]{43}$/u),
        });
    });

    it("spends a code once: the second exchange is invalid_grant", () => {
        const { acr } = mock();
        const code = codeFrom(acr);
        expect(exchange(acr, code).status).toBe(200);
        expect(JSON.parse(exchange(acr, code).body)).toEqual({ error: "invalid_grant" });
    });

    it.each([
        ["a wrong verifier", { code_verifier: "x".repeat(43) }],
        ["another redirect", { redirect_uri: "http://localhost:3000/elsewhere" }],
        ["another resource", { resource: "https://mcp.localhost/mcp" }],
    ])("refuses %s, and spends the code anyway", (_, change) => {
        const { acr } = mock();
        const code = codeFrom(acr);
        expect(JSON.parse(exchange(acr, code, change).body)).toEqual({ error: "invalid_grant" });
        expect(exchange(acr, code).status).toBe(400);
    });

    it("rotates a refresh token, and answers the same successor within 30 s while it is unused", () => {
        const { acr, clock } = mock();
        const first = JSON.parse(exchange(acr, codeFrom(acr)).body);
        const rotated = JSON.parse(refresh(acr, first.refresh_token).body);
        expect(rotated.refresh_token).not.toBe(first.refresh_token);
        clock.t += ACR_REFRESH_GRACE_MS;
        const replay = JSON.parse(refresh(acr, first.refresh_token).body);
        expect(replay.refresh_token).toBe(rotated.refresh_token);
        expect(replay.access_token).toBe(rotated.access_token);
    });

    it("revokes the family on a reuse after 30 s: every token of it is then invalid_grant", () => {
        const { acr, clock } = mock();
        const first = JSON.parse(exchange(acr, codeFrom(acr)).body);
        const rotated = JSON.parse(refresh(acr, first.refresh_token).body);
        clock.t += ACR_REFRESH_GRACE_MS + 1;
        expect(JSON.parse(refresh(acr, first.refresh_token).body)).toEqual({
            error: "invalid_grant",
        });
        expect(JSON.parse(refresh(acr, rotated.refresh_token).body)).toEqual({
            error: "invalid_grant",
        });
    });

    it("revokes the family on a reuse after the successor was used, even within 30 s", () => {
        const { acr } = mock();
        const first = JSON.parse(exchange(acr, codeFrom(acr)).body);
        const rotated = JSON.parse(refresh(acr, first.refresh_token).body);
        expect(refresh(acr, rotated.refresh_token).status).toBe(200);
        expect(JSON.parse(refresh(acr, first.refresh_token).body)).toEqual({
            error: "invalid_grant",
        });
    });

    it("ends a family at 12 h", () => {
        const { acr, clock } = mock();
        const first = JSON.parse(exchange(acr, codeFrom(acr)).body);
        clock.t += ACR_FAMILY_LIFETIME_MS;
        expect(JSON.parse(refresh(acr, first.refresh_token).body)).toEqual({
            error: "invalid_grant",
        });
    });

    it("answers 200 to a revocation, known token or not, and the family is then dead", () => {
        const { acr } = mock();
        const first = JSON.parse(exchange(acr, codeFrom(acr)).body);
        const revoke = (value: string) =>
            acr.handle({
                method: "POST",
                url: `${ISSUER}/revoke`,
                body: tokenForm({ token: value, client_id: ACR_DEV_BROWSER_CLIENT_ID }),
            });
        expect(revoke("acrrt_unknown").status).toBe(200);
        expect(revoke(first.refresh_token).status).toBe(200);
        expect(JSON.parse(refresh(acr, first.refresh_token).body)).toEqual({
            error: "invalid_grant",
        });
    });

    it("never redirects for a wrong client or redirect", () => {
        const { acr } = mock();
        expect(
            acr.handle({
                method: "GET",
                url: authorizeUrl({ redirect_uri: "http://evil.example/cb" }),
            }).status,
        ).toBe(400);
        expect(
            acr.handle({
                method: "GET",
                url: authorizeUrl({ client_id: "https://evil.example/c.json" }),
            }).status,
        ).toBe(400);
    });

    it("answers a consent denial with access_denied, iss and state", () => {
        const { acr } = mock();
        acr.consent = "deny";
        const location = new URL(
            acr.handle({ method: "GET", url: authorizeUrl() }).headers.Location!,
        );
        expect(Object.fromEntries(location.searchParams)).toEqual({
            error: "access_denied",
            iss: ISSUER,
            state: "s".repeat(43),
        });
    });

    it("owns only acr's four endpoints on the issuer origin", () => {
        const { acr } = mock();
        expect(acr.owns(`${ISSUER}/token`)).toBe(true);
        expect(acr.owns(`${ISSUER}/authorize?x=1`)).toBe(true);
        expect(acr.owns(`${ISSUER}/dev`)).toBe(false);
        expect(acr.owns("https://other.example/token")).toBe(false);
    });
});
