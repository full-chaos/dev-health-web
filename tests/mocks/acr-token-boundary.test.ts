import { describe, expect, it } from "vitest";

import { type Observed, tokenBoundaryViolations } from "./acr-token-boundary";

/**
 * CHAOS-12304 (c3 of the T13 split; design §7): where ACR's browser tokens may appear.
 * - The access token `fcacr_`: only in `Authorization: Bearer` on requests to the ACR origin, and in
 *   `/token` response bodies.
 * - The refresh token `acrrt_`: only in `/token` and `/revoke` request bodies, `/token` response
 *   bodies, and this tab's family entry in `sessionStorage`.
 * - Neither one ever in a URL, a request to another origin, `localStorage`, the console or
 *   telemetry (a request to web's own origin).
 */

const ACR = {
    issuer: "http://localhost:3999",
    tokenEndpoint: "http://localhost:3999/token",
    revocationEndpoint: "http://localhost:3999/revoke",
};
const WEB = "http://127.0.0.1:3001";
const ACCESS = `fcacr_${"A".repeat(43)}`;
const REFRESH = `acrrt_${"R".repeat(43)}`;

const request = (
    url: string,
    change: Partial<Extract<Observed, { kind: "request" }>> = {},
): Observed => ({
    kind: "request",
    url,
    method: "GET",
    headers: {},
    body: "",
    ...change,
});
const response = (
    url: string,
    change: Partial<Extract<Observed, { kind: "response" }>> = {},
): Observed => ({
    kind: "response",
    url,
    status: 200,
    headers: {},
    body: "",
    ...change,
});

/** The c2 flow's own traffic: every token where it belongs. */
const ALLOWED: Observed[] = [
    request(`${ACR.issuer}/.well-known/oauth-authorization-server`),
    request(`${ACR.issuer}/authorize?response_type=code&state=s`),
    request(ACR.tokenEndpoint, {
        method: "POST",
        body: "grant_type=authorization_code&code=c&code_verifier=v",
    }),
    response(ACR.tokenEndpoint, {
        body: JSON.stringify({ access_token: ACCESS, refresh_token: REFRESH }),
    }),
    request(ACR.tokenEndpoint, {
        method: "POST",
        body: `grant_type=refresh_token&refresh_token=${REFRESH}`,
    }),
    request(`${ACR.issuer}/api/v1/context-fabric/capabilities`, {
        headers: { authorization: `Bearer ${ACCESS}`, "x-acr-client-version": "0.1.0" },
    }),
    request(ACR.revocationEndpoint, { method: "POST", body: `token=${REFRESH}` }),
    {
        kind: "storage",
        area: "session",
        key: "ask-dev:acr-family",
        value: JSON.stringify({ refreshToken: REFRESH }),
    },
    { kind: "console", text: "ask-dev acr authorization completed" },
];

describe("tokenBoundaryViolations", () => {
    it("allows the c2 flow's own traffic", () => {
        expect(tokenBoundaryViolations(ALLOWED, ACR)).toEqual([]);
    });

    it.each<[string, Observed, string]>([
        ["an access token in a URL", request(`${WEB}/api/x?t=${ACCESS}`), "access token in a URL"],
        [
            "an access token in an ACR URL",
            request(`${ACR.issuer}/x?t=${ACCESS}`),
            "access token in a URL",
        ],
        ["a refresh token in a URL", request(`${WEB}/x#${REFRESH}`), "refresh token in a URL"],
        [
            "an access token in a redirect Location",
            response(`${WEB}/x`, { status: 303, headers: { location: `/y?t=${ACCESS}` } }),
            "access token in a response header",
        ],
        [
            "an access token sent to another origin",
            request("https://other.example/x", { headers: { authorization: `Bearer ${ACCESS}` } }),
            "access token to another origin",
        ],
        [
            "an access token sent to web's own API",
            request(`${WEB}/api/x`, { headers: { authorization: `Bearer ${ACCESS}` } }),
            "access token to another origin",
        ],
        [
            "an access token in another ACR header",
            request(`${ACR.issuer}/x`, { headers: { "x-token": ACCESS } }),
            "access token outside Authorization",
        ],
        [
            "an access token in a request body",
            request(`${ACR.issuer}/x`, { method: "POST", body: ACCESS }),
            "access token in a request body",
        ],
        [
            "a refresh token in a non-ACR request (telemetry)",
            request(`${WEB}/api/telemetry`, { method: "POST", body: REFRESH }),
            "refresh token in a non-ACR request",
        ],
        [
            "a refresh token in an ACR data request",
            request(`${ACR.issuer}/api/v1/x`, { method: "POST", body: REFRESH }),
            "refresh token outside /token and /revoke",
        ],
        [
            "a refresh token in a request header",
            request(ACR.tokenEndpoint, { method: "POST", headers: { "x-refresh": REFRESH } }),
            "refresh token in a request header",
        ],
        [
            "an access token in a response body other than /token",
            response(`${WEB}/api/x`, { body: ACCESS }),
            "access token in a response body",
        ],
        [
            "a refresh token in a response body other than /token",
            response(`${ACR.issuer}/api/v1/x`, { body: REFRESH }),
            "refresh token in a response body",
        ],
        [
            "an access token in the console",
            { kind: "console", text: `token ${ACCESS}` },
            "access token in the console",
        ],
        [
            "a refresh token in the console",
            { kind: "console", text: REFRESH },
            "refresh token in the console",
        ],
        [
            "an access token in localStorage",
            { kind: "storage", area: "local", key: "x", value: ACCESS },
            "access token in localStorage",
        ],
        [
            "a refresh token in localStorage",
            { kind: "storage", area: "local", key: "ask-dev:acr-family", value: REFRESH },
            "refresh token in localStorage",
        ],
        [
            "an access token in sessionStorage",
            { kind: "storage", area: "session", key: "ask-dev:acr-family", value: ACCESS },
            "access token in sessionStorage",
        ],
        [
            "an access token as a request header name (r1)",
            request(`${ACR.issuer}/x`, { headers: { [ACCESS]: "1" } }),
            "access token outside Authorization",
        ],
        [
            "an access token as a header name to another origin (r1)",
            request(`${WEB}/x`, { headers: { [ACCESS]: "1" } }),
            "access token to another origin",
        ],
        [
            "a refresh token as a request header name (r1)",
            request(ACR.tokenEndpoint, { method: "POST", headers: { [REFRESH]: "1" } }),
            "refresh token in a request header",
        ],
        [
            "an access token as a response header name (r1)",
            response(`${WEB}/x`, { headers: { [ACCESS]: "1" } }),
            "access token in a response header",
        ],
        [
            "an access token as a localStorage key (r1)",
            { kind: "storage", area: "local", key: ACCESS, value: "1" },
            "access token in localStorage",
        ],
        [
            "a refresh token as a localStorage key (r1)",
            { kind: "storage", area: "local", key: REFRESH, value: "1" },
            "refresh token in localStorage",
        ],
        [
            "an access token as a sessionStorage key (r1)",
            { kind: "storage", area: "session", key: ACCESS, value: "1" },
            "access token in sessionStorage",
        ],
        [
            "a refresh token as a sessionStorage key (r1)",
            { kind: "storage", area: "session", key: REFRESH, value: "1" },
            "refresh token in sessionStorage outside the family",
        ],
        [
            "a refresh token in another sessionStorage key",
            { kind: "storage", area: "session", key: "x", value: REFRESH },
            "refresh token in sessionStorage outside the family",
        ],
    ])("names %s", (_, observed, name) => {
        expect(tokenBoundaryViolations([...ALLOWED, observed], ACR)).toEqual([name]);
    });

    it.each<[string, Observed, string]>([
        [
            "a percent-encoded access token in a URL",
            request(
                `${WEB}/x?t=${[...ACCESS].map((c) => `%${c.charCodeAt(0).toString(16)}`).join("")}`,
            ),
            "access token in a URL",
        ],
        [
            "a twice-encoded refresh token in a URL",
            request(
                `${WEB}/x?t=${encodeURIComponent(encodeURIComponent(REFRESH).replaceAll("_", "%5F"))}`,
            ),
            "refresh token in a URL",
        ],
        [
            "an encoded refresh token in a body to web",
            request(`${WEB}/api/x`, { method: "POST", body: `t=acrrt%5F${"R".repeat(43)}` }),
            "refresh token in a non-ACR request",
        ],
    ])("names %s (r3)", (_, observed, name) => {
        expect(tokenBoundaryViolations([...ALLOWED, observed], ACR)).toEqual([name]);
    });

    it("catches a short planted token, not only the 43-character shape", () => {
        expect(tokenBoundaryViolations([request(`${WEB}/x?t=fcacr_PLANTED0123`)], ACR)).toEqual([
            "access token in a URL",
        ]);
    });

    it("does not take the token shapes in code as tokens", () => {
        expect(
            tokenBoundaryViolations(
                [
                    response(`${WEB}/_next/static/chunk.js`, {
                        body: "/^fcacr_[A-Za-z0-9_-]{43}$/u;/^acrrt_[A-Za-z0-9_-]{43}$/u",
                    }),
                ],
                ACR,
            ),
        ).toEqual([]);
    });
});
