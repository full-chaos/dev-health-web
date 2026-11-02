import type { BrowserContext } from "@playwright/test";

import { ACR_DEV_BROWSER_CLIENT_ID, AcrOAuthMock } from "./acr-oauth";

/**
 * The browser's ACR client in an e2e page, with ACR on its own origin (CHAOS-12304). c2's own e2e
 * puts the mock issuer on the page's origin. The secret boundary needs a separate ACR origin, so
 * that "only to the ACR origin" means something. Two routes do what production does with
 * `ACR_OAUTH_ISSUER` set:
 * - runtime-config.js carries the issuer and the web origin;
 * - the issuer origin is answered by `AcrOAuthMock` (acr-api's captured answers and rules), with
 *   acr-api's own CORS headers on every answer.
 *
 * The issuer is `http://localhost:8800` (`ACR_E2E_ISSUER`). That origin is already in the app's CSP
 * `connect-src` (`src/proxy.ts`, ACR's local port), so the page's CSP is left as served. Rewriting
 * the document through a route instead makes Chromium treat the page as public: its Local Network
 * Access checks then block the page's own loopback requests (ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS).
 */

/** acr `internal/api/cors.go:33-36` at the web pin bd92be5a. */
export const ACR_CORS = {
    allowMethods: "GET, POST, DELETE, OPTIONS",
    allowHeaders:
        "Authorization, Content-Type, X-ACR-Client-Version, X-ACR-Submission-ID, X-ACR-Thread-ID, X-ACR-Wait-Budget-Seconds, X-ACR-Resource, X-Request-ID, Last-Event-ID",
    exposeHeaders: "Retry-After, X-Request-ID",
    maxAgeSeconds: "600",
} as const;

/**
 * Web's `POST /api/ask-dev/authorize` (CHAOS-12474), over the mock. Its own test runs the real route
 * against a stub of ACR; an e2e here needs only what it answers, from what ACR's mock decided. The
 * mock's `/authorize` gives the code in one step, where ACR gives a handle and then a consent.
 */
export async function serveAskDevAuthorize(
    context: BrowserContext,
    acr: AcrOAuthMock,
    web: string,
    issuer: string,
): Promise<void> {
    await context.route(`${web}/api/ask-dev/authorize`, async (route) => {
        const body = route.request().postDataJSON() as { code_challenge: string; state: string };
        const authorize = new URL(`${issuer}/authorize`);
        authorize.search = new URLSearchParams({
            response_type: "code",
            client_id: ACR_DEV_BROWSER_CLIENT_ID,
            redirect_uri: `${web}/ask-dev/oauth/callback`,
            code_challenge: body.code_challenge,
            code_challenge_method: "S256",
            state: body.state,
            resource: issuer,
            scope: "context:read evidence:read",
        }).toString();
        const answer = acr.handle({ method: "GET", url: authorize.href });
        const params = new URL(answer.headers.Location ?? `${web}/`).searchParams;
        const code = params.get("code");
        await route.fulfill({
            status: code === null ? 502 : 200,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
            body: JSON.stringify(
                code === null
                    ? { error: { code: "acr_refused" } }
                    : { code, state: params.get("state"), iss: params.get("iss") },
            ),
        });
    });
}

/** A loopback origin other than the web's, already allowed by the app's CSP. */
export const ACR_E2E_ISSUER = "http://localhost:8800";

/** One answer the issuer origin gave, recorded where it is made (the route), body included. */
export type AcrAnswer = {
    readonly url: string;
    readonly status: number;
    readonly headers: Record<string, string>;
    readonly body: string;
};

export type CrossOriginAcr = {
    readonly acr: AcrOAuthMock;
    /** Every answer of the issuer origin. A page that navigates away cannot lose these bodies. */
    readonly answers: AcrAnswer[];
    readonly issuer: string;
    readonly web: string;
    readonly endpoints: {
        readonly issuer: string;
        readonly tokenEndpoint: string;
        readonly revocationEndpoint: string;
    };
};

export async function installCrossOriginAcr(
    context: BrowserContext,
    web: string,
    issuer: string,
): Promise<CrossOriginAcr> {
    const acr = new AcrOAuthMock({ issuer, redirectUri: `${web}/ask-dev/oauth/callback` });
    await serveAskDevAuthorize(context, acr, web, issuer);
    const answers: AcrAnswer[] = [];
    const cors = {
        "Access-Control-Allow-Origin": web,
        "Access-Control-Expose-Headers": ACR_CORS.exposeHeaders,
        Vary: "Origin",
    };

    await context.route(`${web}/runtime-config.js`, async (route) => {
        const response = await route.fetch();
        const text = await response.text();
        const match = text.match(/^window\.__DEV_HEALTH_RUNTIME__ = (.*);$/mu);
        if (match === null) throw new Error("runtime-config.js has no runtime assignment");
        const payload = JSON.parse(match[1]!) as { publicEnv: Record<string, string> };
        payload.publicEnv.NEXT_PUBLIC_ACR_OAUTH_ISSUER = issuer;
        payload.publicEnv.NEXT_PUBLIC_ACR_WEB_ORIGIN = web;
        await route.fulfill({
            response,
            body: `// Auto-generated at start-up.\nwindow.__DEV_HEALTH_RUNTIME__ = ${JSON.stringify(payload)};\n`,
        });
    });

    await context.route(
        (url) => url.origin === issuer,
        async (route) => {
            const request = route.request();
            if (request.method() === "OPTIONS") {
                answers.push({ url: request.url(), status: 204, headers: {}, body: "" });
                await route.fulfill({
                    status: 204,
                    headers: {
                        ...cors,
                        "Access-Control-Allow-Methods": ACR_CORS.allowMethods,
                        "Access-Control-Allow-Headers": ACR_CORS.allowHeaders,
                        "Access-Control-Max-Age": ACR_CORS.maxAgeSeconds,
                    },
                    body: "",
                });
                return;
            }
            if (acr.owns(request.url())) {
                const answer = acr.handle({
                    method: request.method(),
                    url: request.url(),
                    body: request.postData(),
                });
                const headers = { ...answer.headers };
                delete headers["Access-Control-Allow-Origin"];
                answers.push({
                    url: request.url(),
                    status: answer.status,
                    headers: { ...headers, ...cors },
                    body: answer.body,
                });
                await route.fulfill({
                    status: answer.status,
                    headers: { ...headers, ...cors },
                    body: answer.body,
                });
                return;
            }
            // A data route: the boundary checks what the browser sends, not what ACR answers.
            answers.push({ url: request.url(), status: 200, headers: { ...cors }, body: "{}" });
            await route.fulfill({
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "no-store",
                    ...cors,
                },
                body: "{}",
            });
        },
    );

    return {
        acr,
        answers,
        issuer,
        web,
        endpoints: {
            issuer,
            tokenEndpoint: `${issuer}/token`,
            revocationEndpoint: `${issuer}/revoke`,
        },
    };
}
