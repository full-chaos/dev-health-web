import { afterEach, describe, expect, it, vi } from "vitest";

import { isPublicPath } from "@/proxy";

import { GET } from "../route";

/**
 * CHAOS-12302: the client ID metadata document ACR fetches for web's first-party browser client.
 * The rules it must meet are acr's (`internal/auth/oauth.go`, `internal/auth/oauth_client_metadata.go`,
 * `internal/storage/oauth.go` at the web pin bd92be5a): `client_id` equals the URL it was fetched
 * from; https with a path, no trailing slash, no dot segments, no fragment or user info, at most
 * 2048 characters; `redirect_uris` non-empty, each https or http loopback, at most 2048
 * characters, no fragment or user info; `token_endpoint_auth_method` none; `client_name` at most
 * 200 characters with no control character; no duplicate member names (also by case); answered
 * 200 with Content-Type application/json in at most 5 KiB. ACR fetches it only from a public https
 * address, so this test holds web to the rules, and the first live fetch is the T13 roll.
 */

vi.mock("@/lib/logger", () => ({
    logger: {
        child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn() })),
        info: vi.fn(),
        warn: vi.fn(),
    },
}));

afterEach(() => {
    vi.unstubAllEnvs();
});

function configure(issuer: string, authUrl: string) {
    vi.stubEnv("ACR_OAUTH_ISSUER", issuer);
    vi.stubEnv("AUTH_URL", authUrl);
}

const CONTROL = /[\u0000-\u001f\u007f]/u;

const DECODED = [
    "client_id",
    "client_name",
    "redirect_uris",
    "token_endpoint_auth_method",
    "token_endpoint_auth_methods_supported",
];

/** acr's CIMD and client-id rules, mirrored for the document web serves. */
function acrAccepts(document: Record<string, unknown>, fetchedFrom: string): string[] {
    const problems: string[] = [];
    const clientId = document.client_id;
    if (clientId !== fetchedFrom) problems.push("bad_client_id");
    const url = new URL(fetchedFrom);
    if (url.protocol !== "https:") problems.push("client_id not https");
    if (url.pathname === "/" || url.pathname.endsWith("/")) problems.push("client_id path");
    if (url.pathname.split("/").some((segment) => segment === "." || segment === "..")) {
        problems.push("client_id dot segment");
    }
    if (url.hash !== "" || url.username !== "" || url.password !== "")
        problems.push("client_id parts");
    if (fetchedFrom.length > 2048) problems.push("client_id length");
    const redirects = document.redirect_uris;
    if (!Array.isArray(redirects) || redirects.length === 0) problems.push("redirect_uris");
    for (const redirect of Array.isArray(redirects) ? redirects : []) {
        const parsed = new URL(String(redirect));
        const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
        if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) {
            problems.push("redirect scheme");
        }
        if (parsed.hash !== "" || parsed.username !== "" || String(redirect).length > 2048) {
            problems.push("redirect form");
        }
    }
    const method = document.token_endpoint_auth_method;
    if (method !== undefined && method !== "none") problems.push("auth_method_unsupported");
    const name = document.client_name;
    if (typeof name !== "string" || name.length > 200 || CONTROL.test(name))
        problems.push("client_name");
    // acr decodes only these five members (`internal/auth/oauth.go:167-173`) with encoding/json
    // and no DisallowUnknownFields (`oauth_client_metadata.go:135`), so other members are ignored.
    // `unambiguousClientMetadataObject` (`:177`) refuses two names equal ignoring case, and a name
    // equal to a decoded one only ignoring case.
    const keys = Object.keys(document);
    const lower = keys.map((key) => key.toLowerCase());
    if (new Set(lower).size !== lower.length) problems.push("duplicate member");
    if (keys.some((key) => DECODED.some((name) => key !== name && key.toLowerCase() === name))) {
        problems.push("case variant of a decoded member");
    }
    return problems;
}

describe("GET /oauth/acr-client.json", () => {
    it("is public: ACR fetches it with no credential", () => {
        expect(isPublicPath("/oauth/acr-client.json")).toBe(true);
    });

    it("serves the document ACR accepts on an https origin", async () => {
        configure("https://acr.fullchaos.dev", "https://www.fullchaos.dev");
        const response = GET();
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/json");
        const text = await response.text();
        expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(5 * 1024);
        const document = JSON.parse(text) as Record<string, unknown>;
        expect(document).toEqual({
            client_id: "https://www.fullchaos.dev/oauth/acr-client.json",
            client_name: "Dev Health",
            redirect_uris: ["https://www.fullchaos.dev/ask-dev/oauth/callback"],
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
        });
        expect(acrAccepts(document, "https://www.fullchaos.dev/oauth/acr-client.json")).toEqual([]);
    });

    it("is not found while the browser client is off", () => {
        configure("", "https://www.fullchaos.dev");
        expect(GET().status).toBe(404);
    });

    it("is not found on an http loopback origin, which uses ACR's development client", () => {
        configure("https://acr.localhost", "http://localhost:3000");
        expect(GET().status).toBe(404);
    });

    it("the contract check refuses the documents ACR refuses (it can fail)", () => {
        const good = {
            client_id: "https://www.fullchaos.dev/oauth/acr-client.json",
            client_name: "Dev Health",
            redirect_uris: ["https://www.fullchaos.dev/ask-dev/oauth/callback"],
            token_endpoint_auth_method: "none",
        };
        const url = good.client_id;
        expect(acrAccepts({ ...good, client_id: "https://other.example/x.json" }, url)).toContain(
            "bad_client_id",
        );
        expect(acrAccepts({ ...good, redirect_uris: [] }, url)).toContain("redirect_uris");
        expect(
            acrAccepts({ ...good, redirect_uris: ["http://www.fullchaos.dev/cb"] }, url),
        ).toContain("redirect scheme");
        expect(
            acrAccepts({ ...good, token_endpoint_auth_method: "client_secret_basic" }, url),
        ).toContain("auth_method_unsupported");
        expect(acrAccepts({ ...good, client_name: "x".repeat(201) }, url)).toContain("client_name");
        expect(acrAccepts({ ...good, Client_Name: "dup" }, url)).toContain("duplicate member");
        expect(acrAccepts({ ...good, CLIENT_ID: url }, url)).toContain("duplicate member");
        expect(acrAccepts({ ...good, Redirect_URIs: [] }, url)).toContain(
            "case variant of a decoded member",
        );
        // Members acr does not decode are ignored, as the advertised grant and response types are.
        expect(
            acrAccepts({ ...good, grant_types: ["refresh_token"], response_types: ["code"] }, url),
        ).toEqual([]);
    });
});
