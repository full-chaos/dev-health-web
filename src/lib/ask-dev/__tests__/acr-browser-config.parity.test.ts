import { afterEach, describe, expect, it, vi } from "vitest";

import { loadFirstPartyBrowserClient, serverAcrClientConfig } from "@/lib/acr/config";

import { ACR_PUBLIC_KEYS, acrPublicEnv } from "../../../../scripts/runtime-config-acr.mjs";
import {
    ACR_ISSUER_PUBLIC_KEY,
    ACR_WEB_ORIGIN_PUBLIC_KEY,
    acrBrowserClientConfig,
} from "../acr-browser-config";

/**
 * CHAOS-12302 (r1): three producers read the same two settings, and they must agree.
 *
 * - The metadata document and its client id (`serverAcrClientConfig`).
 * - T4c's first-party check (`loadFirstPartyBrowserClient`, CHAOS-12095). It approves the browser
 *   client with no click, and refuses the Approve button for it. So a client the document serves
 *   that T4c does not see as first-party would be stuck at the consent page.
 * - The browser's view: what `scripts/write-runtime-config.mjs` writes at start-up, read back the
 *   way the browser reads it.
 *
 * This test runs all three over the same settings. It does not pin a rule in two places.
 */

const ISSUERS = [
    undefined,
    "",
    "https://acr.fullchaos.dev",
    " https://acr.fullchaos.dev ",
    "https://acr.fullchaos.dev/",
    "https://acr.fullchaos.dev/oauth",
    "http://acr.fullchaos.dev",
    "https://acr.localhost",
    "http://localhost:8800",
    "http://127.0.0.1:8800",
    "http://[::1]:8800",
    "https://acr.fullchaos.dev:8443",
    "https://acr_internal.fullchaos.dev",
    "https://*.fullchaos.dev",
    "https://user@acr.fullchaos.dev",
    "https://user:secret@acr.fullchaos.dev",
    "https://acr.fullchaos.dev?key=secret",
];

const WEB: ReadonlyArray<readonly [string | undefined, string | undefined]> = [
    [undefined, undefined],
    ["https://www.fullchaos.dev", undefined],
    ["https://www.fullchaos.dev/api/auth", undefined],
    [" https://www.fullchaos.dev ", undefined],
    ["", "https://www.fullchaos.dev"],
    ["  ", "https://www.fullchaos.dev"],
    [undefined, "https://www.fullchaos.dev"],
    ["https://www.fullchaos.dev", "https://other.fullchaos.dev"],
    ["http://localhost:3000", undefined],
    ["http://127.0.0.1:3000", undefined],
    ["http://www.fullchaos.dev", undefined],
    ["https://user:pass@www.fullchaos.dev", undefined],
    ["not a url", "https://www.fullchaos.dev"],
    ["ftp://www.fullchaos.dev", undefined],
    ["https://*.fullchaos.dev", undefined],
    ["https://web_internal.fullchaos.dev", undefined],
    ["http://[::1]:3000", undefined],
];

type Env = { ACR_OAUTH_ISSUER?: string; AUTH_URL?: string; NEXTAUTH_URL?: string };

function stub(env: Env) {
    vi.stubEnv("ACR_OAUTH_ISSUER", env.ACR_OAUTH_ISSUER);
    vi.stubEnv("AUTH_URL", env.AUTH_URL);
    vi.stubEnv("NEXTAUTH_URL", env.NEXTAUTH_URL);
}

afterEach(() => {
    vi.unstubAllEnvs();
});

const CASES = ISSUERS.flatMap((issuer) =>
    WEB.map(([authUrl, nextAuthUrl]) => ({
        ACR_OAUTH_ISSUER: issuer,
        AUTH_URL: authUrl,
        NEXTAUTH_URL: nextAuthUrl,
    })),
);

describe("the ACR browser client: server, T4c and browser agree", () => {
    it.each(CASES.map((env) => [JSON.stringify(env), env] as const))("%s", (_, env) => {
        stub(env);
        const server = serverAcrClientConfig();
        const firstParty = loadFirstPartyBrowserClient();
        const publicEnv = acrPublicEnv(env);
        const browser = acrBrowserClientConfig(
            publicEnv[ACR_ISSUER_PUBLIC_KEY],
            publicEnv[ACR_WEB_ORIGIN_PUBLIC_KEY],
        );

        // A client web serves is one T4c approves with no click.
        if (server !== undefined) {
            expect(firstParty).toEqual({ resource: server.issuer, webOrigin: server.webOrigin });
        }
        // The browser is the same client as the server, or none.
        expect(browser).toEqual(server);
        // The public file carries an issuer only when it is exactly an origin (r2: never user info,
        // a path or a query from a mistyped setting).
        const copied = publicEnv[ACR_ISSUER_PUBLIC_KEY];
        if (copied !== undefined) expect(new URL(copied).origin).toBe(copied);
        // CHAOS-12316: the file holds what the browser uses, or nothing. A value the browser
        // refuses never reaches it.
        expect(publicEnv).toEqual(
            browser === undefined
                ? {}
                : {
                      [ACR_ISSUER_PUBLIC_KEY]: browser.issuer,
                      [ACR_WEB_ORIGIN_PUBLIC_KEY]: browser.webOrigin,
                  },
        );
    });

    it("the generator writes the keys the browser reads", () => {
        expect(ACR_PUBLIC_KEYS).toEqual([ACR_ISSUER_PUBLIC_KEY, ACR_WEB_ORIGIN_PUBLIC_KEY]);
    });

    it("covers both states: the matrix holds clients that are on and clients that are off", () => {
        const on = CASES.filter((env) => {
            stub(env);
            return serverAcrClientConfig() !== undefined;
        });
        expect(on.length).toBeGreaterThan(5);
        expect(on.length).toBeLessThan(CASES.length / 2);
    });
});
