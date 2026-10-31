import { afterEach, describe, expect, it, vi } from "vitest";

import {
    ACR_CLIENT_METADATA_PATH,
    ACR_DEV_BROWSER_CLIENT_ID,
    ACR_OAUTH_CALLBACK_PATH,
    acrBrowserClientConfig,
    browserAcrClientConfig,
} from "../acr-browser-config";
import { serverAcrClientConfig } from "@/lib/acr/config";

/**
 * CHAOS-12302 (c1 of the T13 split): the one place web decides which ACR OAuth client it is.
 * ACR's rules (acr `internal/auth/oauth.go`): the issuer is an https origin (http only on a
 * loopback host) with no path; a browser client is either a client ID metadata document at an
 * https URL, or the development-only static client `https://localhost/acr/dev-browser-client`,
 * whose redirects are exact http loopback URLs.
 */

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe("acrBrowserClientConfig", () => {
    it("is off without an issuer", () => {
        expect(acrBrowserClientConfig(undefined, "https://www.fullchaos.dev")).toBeUndefined();
        expect(acrBrowserClientConfig("", "https://www.fullchaos.dev")).toBeUndefined();
        expect(acrBrowserClientConfig("   ", "https://www.fullchaos.dev")).toBeUndefined();
    });

    it("serves a metadata document client on an https origin", () => {
        expect(
            acrBrowserClientConfig("https://acr.fullchaos.dev", "https://www.fullchaos.dev"),
        ).toEqual({
            issuer: "https://acr.fullchaos.dev",
            webOrigin: "https://www.fullchaos.dev",
            clientId: `https://www.fullchaos.dev${ACR_CLIENT_METADATA_PATH}`,
            redirectUri: `https://www.fullchaos.dev${ACR_OAUTH_CALLBACK_PATH}`,
            usesMetadataDocument: true,
        });
    });

    it("uses the development client on an http loopback origin (kiac)", () => {
        expect(acrBrowserClientConfig("https://acr.localhost", "http://localhost:3000")).toEqual({
            issuer: "https://acr.localhost",
            webOrigin: "http://localhost:3000",
            clientId: ACR_DEV_BROWSER_CLIENT_ID,
            redirectUri: "http://localhost:3000/ask-dev/oauth/callback",
            usesMetadataDocument: false,
        });
        expect(
            acrBrowserClientConfig("https://acr.localhost", "http://127.0.0.1:3000")?.clientId,
        ).toBe(ACR_DEV_BROWSER_CLIENT_ID);
        expect(acrBrowserClientConfig("https://acr.localhost", "http://[::1]:3000")?.clientId).toBe(
            ACR_DEV_BROWSER_CLIENT_ID,
        );
    });

    it("takes the web origin from a URL with a path, as AUTH_URL may carry one", () => {
        expect(
            acrBrowserClientConfig(
                "https://acr.fullchaos.dev",
                "https://www.fullchaos.dev/api/auth",
            )?.webOrigin,
        ).toBe("https://www.fullchaos.dev");
    });

    it.each([
        ["a path", "https://acr.fullchaos.dev/oauth"],
        ["a trailing slash", "https://acr.fullchaos.dev/"],
        ["a query", "https://acr.fullchaos.dev?x=1"],
        ["a fragment", "https://acr.fullchaos.dev#x"],
        ["user info", "https://user@acr.fullchaos.dev"],
        ["http on a public host", "http://acr.fullchaos.dev"],
        ["another scheme", "ftp://acr.fullchaos.dev"],
        ["no URL", "acr.fullchaos.dev"],
        ["a wildcard host", "https://*.fullchaos.dev"],
        ["a space", "https://acr.fullchaos.dev https://evil.example"],
    ])("refuses an issuer with %s, as ACR does", (_, issuer) => {
        expect(acrBrowserClientConfig(issuer, "https://www.fullchaos.dev")).toBeUndefined();
    });

    it("allows an http issuer only on a loopback host", () => {
        expect(
            acrBrowserClientConfig("http://localhost:8800", "http://localhost:3000")?.issuer,
        ).toBe("http://localhost:8800");
    });

    it.each([
        ["no web origin", undefined],
        ["http on a public host", "http://www.fullchaos.dev"],
        ["not a URL", "www.fullchaos.dev"],
        ["user info", "https://user:pass@www.fullchaos.dev"],
    ])("is off with %s", (_, webOrigin) => {
        expect(acrBrowserClientConfig("https://acr.fullchaos.dev", webOrigin)).toBeUndefined();
    });
});

describe("serverAcrClientConfig", () => {
    it("reads ACR_OAUTH_ISSUER and AUTH_URL", () => {
        vi.stubEnv("ACR_OAUTH_ISSUER", "https://acr.fullchaos.dev");
        vi.stubEnv("AUTH_URL", "https://www.fullchaos.dev");
        expect(serverAcrClientConfig()?.clientId).toBe(
            "https://www.fullchaos.dev/oauth/acr-client.json",
        );
    });

    it("falls back to NEXTAUTH_URL when AUTH_URL is unset, as T4c does", () => {
        vi.stubEnv("ACR_OAUTH_ISSUER", "https://acr.fullchaos.dev");
        vi.stubEnv("AUTH_URL", undefined);
        vi.stubEnv("NEXTAUTH_URL", "https://www.fullchaos.dev");
        expect(serverAcrClientConfig()?.webOrigin).toBe("https://www.fullchaos.dev");
    });

    it("is off when AUTH_URL is set but empty, as T4c is (r1)", () => {
        vi.stubEnv("ACR_OAUTH_ISSUER", "https://acr.fullchaos.dev");
        vi.stubEnv("AUTH_URL", "");
        vi.stubEnv("NEXTAUTH_URL", "https://www.fullchaos.dev");
        expect(serverAcrClientConfig()).toBeUndefined();
    });

    it("is off when ACR_OAUTH_ISSUER is unset", () => {
        vi.stubEnv("ACR_OAUTH_ISSUER", "");
        vi.stubEnv("AUTH_URL", "https://www.fullchaos.dev");
        expect(serverAcrClientConfig()).toBeUndefined();
    });
});

describe("browserAcrClientConfig", () => {
    function runtime(publicEnv: Record<string, string>, origin: string) {
        vi.stubGlobal("window", {
            __DEV_HEALTH_RUNTIME__: { publicEnv },
            location: { origin },
        });
    }

    it("reads the runtime config the server wrote at start-up", () => {
        runtime(
            {
                NEXT_PUBLIC_ACR_OAUTH_ISSUER: "https://acr.fullchaos.dev",
                NEXT_PUBLIC_ACR_WEB_ORIGIN: "https://www.fullchaos.dev",
            },
            "https://www.fullchaos.dev",
        );
        expect(browserAcrClientConfig()?.clientId).toBe(
            "https://www.fullchaos.dev/oauth/acr-client.json",
        );
    });

    it("is off on another origin: its redirect would not match the registered one", () => {
        runtime(
            {
                NEXT_PUBLIC_ACR_OAUTH_ISSUER: "https://acr.fullchaos.dev",
                NEXT_PUBLIC_ACR_WEB_ORIGIN: "https://www.fullchaos.dev",
            },
            "https://preview.fullchaos.dev",
        );
        expect(browserAcrClientConfig()).toBeUndefined();
    });

    it("is off without the runtime keys", () => {
        runtime({}, "https://www.fullchaos.dev");
        expect(browserAcrClientConfig()).toBeUndefined();
    });

    it("is off on the server", () => {
        expect(browserAcrClientConfig()).toBeUndefined();
    });
});
