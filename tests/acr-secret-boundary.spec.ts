import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
    expect,
    request as playwrightRequest,
    test,
    type Page,
    type Request,
    type Response,
} from "@playwright/test";

import { ACR_E2E_ISSUER, installCrossOriginAcr } from "./mocks/acr-browser-client";
import { accessTokensIn, type Observed, tokenBoundaryViolations } from "./mocks/acr-token-boundary";

const CONTEXT_FABRIC_VALIDATION_PATH = "/superadmin/context-fabric/validation";

const PROBE_ACTION_ID = "0".repeat(40);
const STOP_DRAIN_TIMEOUT_MS = 10_000;
const MAX_REDIRECT_HOPS = 10;
const DRAIN_SETTLE_MS = 50;
const FOLLOWED_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const BODY_HEADERS = [
    "content-type",
    "content-length",
    "content-encoding",
    "content-language",
    "content-location",
];
const CREDENTIAL_HEADER =
    /^(?:authorization|proxy-authorization)$|token|secret|credential|api-?key/iu;

type JarCookie = {
    name: string;
    value: string;
    domain: string;
    path: string;
    secure: boolean;
    expires: number;
};

function cookiesFor(jar: JarCookie[], url: URL): string {
    const now = Date.now() / 1000;
    const latest = new Map<string, JarCookie>();
    for (const cookie of jar) latest.set(`${cookie.name}|${cookie.domain}|${cookie.path}`, cookie);
    return [...latest.values()]
        .filter((cookie) => {
            const domain = cookie.domain.replace(/^\./u, "");
            const domainMatch = cookie.domain.startsWith(".")
                ? url.hostname === domain || url.hostname.endsWith(`.${domain}`)
                : url.hostname === domain;
            const pathMatch =
                url.pathname === cookie.path ||
                url.pathname.startsWith(
                    cookie.path.endsWith("/") ? cookie.path : `${cookie.path}/`,
                );
            const alive = cookie.expires === -1 || cookie.expires > now;
            return (
                domainMatch && pathMatch && alive && (!cookie.secure || url.protocol === "https:")
            );
        })
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join("; ");
}

function parseSetCookie(header: string, url: URL): JarCookie | null {
    const [pair = "", ...attributes] = header.split(";");
    const separator = pair.indexOf("=");
    if (separator <= 0) return null;
    const cookie: JarCookie = {
        domain: url.hostname,
        expires: -1,
        name: pair.slice(0, separator).trim(),
        path:
            url.pathname.lastIndexOf("/") > 0
                ? url.pathname.slice(0, url.pathname.lastIndexOf("/"))
                : "/",
        secure: false,
        value: pair.slice(separator + 1).trim(),
    };
    for (const attribute of attributes) {
        const [rawName = "", ...rawValue] = attribute.split("=");
        const name = rawName.trim().toLowerCase();
        const value = rawValue.join("=").trim();
        if (name === "path" && value.startsWith("/")) cookie.path = value;
        if (name === "secure") cookie.secure = true;
        if (name === "max-age" && Number.isFinite(Number(value))) {
            cookie.expires = Date.now() / 1000 + Number(value);
        }
        if (name === "expires" && cookie.expires === -1 && !Number.isNaN(Date.parse(value))) {
            cookie.expires = Date.parse(value) / 1000;
        }
    }
    return cookie;
}

// CHAOS-12304: the refresh token `acrrt_` is a secret too; `fcacr_` matching does not cover it.
const secretPattern =
    /BEGIN (?:EC |RSA )?PRIVATE KEY|fcacr_[A-Za-z0-9]|acrrt_[A-Za-z0-9]|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/u;
const clientChunkForbiddenPattern =
    /ACR_API_ORIGIN|ACR_REQUEST_TIMEOUT_MS|ACR_WEB_ASSERTION_(?:KEY_FILE|KID|ISSUER|AUDIENCE)|BEGIN (?:EC |RSA )?PRIVATE KEY|fcacr_[A-Za-z0-9]|acrrt_[A-Za-z0-9]|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/u;

test.beforeEach(async ({ request }) => {
    const response = await request.post("http://127.0.0.1:8001/__test/entitlements", {
        data: { scenario: "provisioned" },
    });
    expect(response.ok()).toBe(true);
});

// Server actions are answered through page.route: the guard reads the FULL response body before the
// page sees it. Chromium cancels the end of a server action's response stream once the action result is
// decoded, and a cancelled response has no readable body, so reading it afterwards is not
// possible; every other response is still read with response.text() and a read failure still fails.
// Redirects of a server action are followed by hand (maxRedirects 0), so the body and headers of every
// hop pass through the guard. 303 and 301/302 after a POST become a GET without a body; 307 and 308
// keep the method and the body. A hop chain longer than MAX_REDIRECT_HOPS fails the guard.
// Known limit: server-action responses are buffered in the guard spec.
// Test seams (used only by the guard's own tests): `upstream` maps the URL of an intercepted action to
// the URL that is really fetched; `onDrained` runs once stop() has seen no pending request, so a test
// can start a request at the worst moment; `drainTimeoutMs` shortens the stop deadline; `recordTask`
// adds a record task of the test's own (one that never ends); `ignoreResponseEvents` drops the response
// events of matching URLs (a response event that is never delivered); `credentials` declares the credentials mode of the page's fetch. Playwright does not expose it
// (an intercepted request's allHeaders() carries jar cookies even for omit), so the default is
// "same-origin", the fetch default and the mode of the app's own server-action fetches.
// Redirect semantics follow fetch: only 301/302/303/307/308 are followed (a 300/304/305 is recorded as
// the final response); Authorization and any token/secret/credential header are dropped on a cross-origin
// hop; Cookie is built from the browser jar and the hop's own Set-Cookie by origin, path, Secure and
// expiry, and by the credentials mode: omit = never, include = every hop, same-origin = only while every
// hop so far is same-origin with the first hop (one cross-origin hop ends cookies for all later hops); the headers that are recorded for a hop are the headers that are sent.
type WatchOptions = {
    mutateActionBody?: (body: string) => string;
    upstream?: (url: string) => string;
    onDrained?: () => Promise<void>;
    drainTimeoutMs?: number;
    recordTask?: () => Promise<void>;
    ignoreResponseEvents?: (url: string) => boolean;
    credentials?: "omit" | "same-origin" | "include";
};

async function watchNetwork(page: Page, origin: string, options: WatchOptions = {}) {
    const directAcrRequests: string[] = [];
    const networkRecords: string[] = [];
    const networkRecordTasks: Promise<void>[] = [];
    const interceptedActions = new Set<Request>();
    const actionCounts = { intercepted: 0, scanned: 0, pageOwn: 0 };
    const pendingRequests = new Set<Request>();
    const seenRequests = new Set<Request>();
    const respondedRequests = new Set<Request>();
    const failedRequests = new Set<Request>();
    const unrecordedRequests = () =>
        [...seenRequests].filter(
            (seen) => !respondedRequests.has(seen) && !failedRequests.has(seen),
        );
    const guardFailures: string[] = [];

    await page.route(
        (url) => url.origin === origin,
        async (route) => {
            const request = route.request();
            if (request.method() !== "POST" || !("next-action" in request.headers())) {
                await route.fallback();
                return;
            }
            actionCounts.intercepted += 1;
            interceptedActions.add(request);
            let target = options.upstream ? options.upstream(request.url()) : request.url();
            let method = request.method();
            let postData: Buffer | null = request.postDataBuffer();
            const initialHeaders = await request.allHeaders();
            const pageUrl = request.url() === target;
            let headers: Record<string, string> = { ...initialHeaders };
            const hopJar: JarCookie[] = [];
            const contextJar = async (): Promise<JarCookie[]> =>
                (await page.context().cookies()).map((cookie) => ({
                    domain: cookie.domain,
                    expires: cookie.expires,
                    name: cookie.name,
                    path: cookie.path,
                    secure: cookie.secure,
                    value: cookie.value,
                }));
            const firstOrigin = new URL(target).origin;
            const credentials = options.credentials ?? "same-origin";
            let tainted = false;
            const cookieFor = async (url: URL): Promise<string> => {
                if (credentials === "omit") return "";
                if (credentials === "same-origin" && (tainted || url.origin !== firstOrigin))
                    return "";
                return cookiesFor([...(await contextJar()), ...hopJar], url);
            };
            const setCookieHeader = (value: string) => {
                if (value === "") delete headers["cookie"];
                else headers["cookie"] = value;
            };
            // Every manual hop uses a fresh API context: an empty cookie jar that never stores a hop's
            // Set-Cookie for the next hop, so every header, cookie and body of a hop is exactly what this
            // handler passes. The contexts live until the handler ends (a response body is read later).
            const hopClients: Awaited<ReturnType<typeof playwrightRequest.newContext>>[] = [];
            const fetchHop = async (
                url: string,
                init: { headers: Record<string, string>; method: string; data?: Buffer },
            ) => {
                const client = await playwrightRequest.newContext({
                    extraHTTPHeaders: {},
                    storageState: { cookies: [], origins: [] },
                });
                hopClients.push(client);
                return client.fetch(url, { ...init, maxRedirects: 0 });
            };
            try {
                if (!pageUrl) {
                    delete headers["host"];
                    if (postData !== null) headers["content-length"] = String(postData.length);
                    setCookieHeader(await cookieFor(new URL(target)));
                }
                networkRecords.push(
                    target,
                    JSON.stringify(headers),
                    postData?.toString("utf8") ?? "",
                );
                let response = pageUrl
                    ? await route.fetch({ maxRedirects: 0 })
                    : await fetchHop(target, {
                          headers,
                          method,
                          ...(postData === null ? {} : { data: postData }),
                      });
                for (let hop = 0; ; hop += 1) {
                    const body = await response.text();
                    const status = response.status();
                    const location = response.headers()["location"];
                    const isRedirect =
                        FOLLOWED_REDIRECT_STATUSES.has(status) && location !== undefined;
                    networkRecords.push(response.url(), JSON.stringify(response.headers()));
                    if (isRedirect) {
                        networkRecords.push(body);
                    } else {
                        networkRecords.push(
                            options.mutateActionBody ? options.mutateActionBody(body) : body,
                        );
                        actionCounts.scanned += 1;
                        if (request.headers()["next-action"] !== PROBE_ACTION_ID)
                            actionCounts.pageOwn += 1;
                        await route.fulfill({ response, body });
                        return;
                    }
                    if (hop >= MAX_REDIRECT_HOPS) {
                        guardFailures.push(
                            `server action redirect chain longer than ${MAX_REDIRECT_HOPS} hops: ${request.url()}`,
                        );
                        await route.abort();
                        return;
                    }
                    const hopUrl = new URL(response.url());
                    const next = new URL(location, hopUrl);
                    for (const header of response.headersArray()) {
                        if (header.name.toLowerCase() !== "set-cookie") continue;
                        const cookie = parseSetCookie(header.value, hopUrl);
                        if (cookie !== null && credentials !== "omit") hopJar.push(cookie);
                    }
                    if (
                        status === 303 ||
                        ((status === 301 || status === 302) && method === "POST")
                    ) {
                        method = "GET";
                        postData = null;
                    }
                    headers = { ...headers };
                    delete headers["host"];
                    if (next.origin !== hopUrl.origin) {
                        for (const name of Object.keys(headers)) {
                            if (CREDENTIAL_HEADER.test(name)) delete headers[name];
                        }
                    }
                    if (next.origin !== firstOrigin) tainted = true;
                    setCookieHeader(await cookieFor(next));
                    if (postData === null) {
                        for (const name of BODY_HEADERS) delete headers[name];
                    } else {
                        headers["content-length"] = String(postData.length);
                    }
                    target = next.toString();
                    networkRecords.push(
                        target,
                        JSON.stringify(headers),
                        postData?.toString("utf8") ?? "",
                    );
                    response = await fetchHop(target, {
                        headers,
                        method,
                        ...(postData === null ? {} : { data: postData }),
                    });
                }
            } finally {
                await Promise.all(hopClients.map((client) => client.dispose()));
            }
        },
    );
    if (options.recordTask) networkRecordTasks.push(options.recordTask());
    const onRequest = (request: Request) => {
        pendingRequests.add(request);
        seenRequests.add(request);
        if (request.url().includes("/api/v1/agent-context")) directAcrRequests.push(request.url());
        networkRecords.push(request.postData() ?? "");
        networkRecordTasks.push(
            request.allHeaders().then((headers) => {
                networkRecords.push(JSON.stringify(headers));
            }),
        );
    };
    const onRequestDone = (request: Request) => {
        pendingRequests.delete(request);
    };
    const onResponse = (response: Response) => {
        if (options.ignoreResponseEvents?.(response.url())) return;
        respondedRequests.add(response.request());
        networkRecordTasks.push(
            (async () => {
                const headers = await response.allHeaders();
                networkRecords.push(response.url(), JSON.stringify(headers));

                // The body of an intercepted server action was scanned in full by the route handler.
                if (interceptedActions.has(response.request())) return;
                // Chromium does not expose redirect response bodies through CDP. Their
                // browser-visible URL, Location, and other headers remain covered,
                // while every non-redirect response body is still inspected below.
                if (response.status() >= 300 && response.status() < 400) return;
                networkRecords.push(await response.text());
            })(),
        );
    };
    page.on("request", onRequest);
    page.on("response", onResponse);
    page.on("requestfinished", onRequestDone);
    const onRequestFailed = (request: Request) => {
        failedRequests.add(request);
        pendingRequests.delete(request);
    };
    page.on("requestfailed", onRequestFailed);

    // Stop recording: first let every request that is still in flight finish and be recorded while the
    // listeners are attached (a response that arrives after the listener is removed would never be
    // scanned), then detach and wait for the records already started. The check repeats until no request
    // is pending after the records settled, so a request that starts during the drain is covered too.
    // Requests that do not finish in time fail the guard instead of being skipped.
    const stop = async (stopOptions: { expectedFailures?: RegExp[] } = {}) => {
        const deadline = Date.now() + (options.drainTimeoutMs ?? STOP_DRAIN_TIMEOUT_MS);
        const drain = async () => {
            while (pendingRequests.size > 0 && Date.now() < deadline) {
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
        };
        // The record tasks are raced against the deadline: a response body that never ends must fail the
        // guard at the deadline, not hang until the test times out.
        const recordsDone = async () => {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const done = await Promise.race([
                Promise.all(networkRecordTasks).then(() => true),
                new Promise<boolean>((resolve) => {
                    timer = setTimeout(() => resolve(false), Math.max(deadline - Date.now(), 0));
                }),
            ]);
            clearTimeout(timer);
            return done;
        };
        await drain();
        if (options.onDrained) await options.onDrained();
        let settled = false;
        let recordsStuck = false;
        while (!settled && !recordsStuck) {
            await drain();
            recordsStuck = !(await recordsDone());
            await new Promise((resolve) => setTimeout(resolve, DRAIN_SETTLE_MS));
            recordsStuck = recordsStuck || !(await recordsDone());
            settled =
                (pendingRequests.size === 0 && unrecordedRequests().length === 0) ||
                Date.now() >= deadline;
        }
        const unfinished = pendingRequests.size;
        page.off("request", onRequest);
        page.off("response", onResponse);
        page.off("requestfinished", onRequestDone);
        page.off("requestfailed", onRequestFailed);
        if (unfinished > 0 || recordsStuck) {
            // Waiting for the handlers or the record tasks could hang on the very request that is pending.
            await page.unrouteAll({ behavior: "ignoreErrors" });
            expect(recordsStuck, "record tasks still running when the guard stopped").toBe(false);
            expect(unfinished, "requests still in flight when the guard stopped").toBe(0);
        }
        const unrecorded = unrecordedRequests();
        if (unrecorded.length > 0) {
            await page.unrouteAll({ behavior: "ignoreErrors" });
            expect(
                unrecorded.map((seen) => seen.url()),
                "request seen but not recorded when the guard stopped",
            ).toEqual([]);
        }
        await page.unrouteAll({ behavior: "wait" });
        await Promise.all(networkRecordTasks);
        const expected = stopOptions.expectedFailures ?? [];
        expect(guardFailures.length, guardFailures.join("; ")).toBe(expected.length);
        expected.forEach((pattern, index) => expect(guardFailures[index]).toMatch(pattern));
    };
    return { directAcrRequests, networkRecords, stop, actionCounts };
}

const ACTION_PROBE = async ([path, cancelBody, actionId]: [string, boolean, string]) => {
    const response = await fetch(path, {
        body: "[]",
        headers: { "content-type": "text/plain;charset=UTF-8", "next-action": actionId },
        method: "POST",
    });
    if (cancelBody && response.body) {
        const reader = response.body.getReader();
        await reader.cancel();
        return response.status;
    }
    await response.text();
    return response.status;
};

async function runBoundaryScenario(
    page: Page,
    baseURL: string | undefined,
    plant?: () => Promise<void>,
) {
    const { directAcrRequests, networkRecords, stop, actionCounts } = await watchNetwork(
        page,
        new URL(baseURL ?? "http://127.0.0.1:3001").origin,
    );

    await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);
    await expect(page).toHaveURL(new RegExp(`${CONTEXT_FABRIC_VALIDATION_PATH}$`));
    await expect(
        page.getByRole("heading", {
            name: "Context Fabric Validation",
            exact: true,
            level: 1,
        }),
    ).toBeVisible();

    const routeResult = await page.evaluate(async () => {
        const response = await fetch("/api/agent-context/context-packets", {
            body: JSON.stringify({
                goal: "Inspect a safe server boundary",
                repository: "foreign/repository",
            }),
            headers: { "content-type": "application/json" },
            method: "POST",
        });
        return { body: await response.text(), status: response.status };
    });

    expect(routeResult.status).toBeGreaterThanOrEqual(400);
    expect(routeResult.body).not.toMatch(secretPattern);
    expect(directAcrRequests).toEqual([]);

    // The page's own server action (the shell's subscription read) must be intercepted and scanned too,
    // not only the probe below.
    await expect.poll(() => actionCounts.pageOwn, { timeout: 20_000 }).toBeGreaterThan(0);

    // One server action of this guard's own, so the interception is always exercised.
    await page.evaluate(ACTION_PROBE, [CONTEXT_FABRIC_VALIDATION_PATH, false, PROBE_ACTION_ID]);
    await plant?.();

    const clientChunks = await page.evaluate(async () => {
        const urls = performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
            .filter((url) => url.includes("/_next/static/") && url.endsWith(".js"));
        return Promise.all(urls.map(async (url) => (await fetch(url)).text()));
    });
    await stop();
    expect(actionCounts.intercepted).toBeGreaterThan(0);
    expect(actionCounts.scanned).toBe(actionCounts.intercepted);
    expect(networkRecords.join("\n")).not.toMatch(secretPattern);
    expect(clientChunks.join("\n")).not.toMatch(clientChunkForbiddenPattern);
    // Asserted again after every page-own, probe and late request: a direct ACR request made after the
    // first check above must not pass unnoticed.
    expect(directAcrRequests).toEqual([]);
}

test("keeps ACR assertion material out of browser routes, network traffic, and client chunks", async ({
    baseURL,
    page,
}) => {
    await runBoundaryScenario(page, baseURL);
});

test("a direct ACR request made after the early checks fails the boundary scenario", async ({
    baseURL,
    page,
}) => {
    await page.route("**/api/v1/agent-context/__late-direct", (route) =>
        route.fulfill({ body: "ok", contentType: "text/plain" }),
    );
    await expect(
        runBoundaryScenario(page, baseURL, async () => {
            await page.evaluate(async () => {
                await fetch("/api/v1/agent-context/__late-direct");
            });
        }),
    ).rejects.toThrow(/__late-direct/u);
});

test("scans the full body of a server action response for secret material", async ({
    baseURL,
    page,
}) => {
    const { networkRecords, stop, actionCounts } = await watchNetwork(
        page,
        new URL(baseURL ?? "http://127.0.0.1:3001").origin,
        { mutateActionBody: (body) => `${body}\nfcacr_PLANTED0123456789` },
    );

    await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);
    await page.evaluate(ACTION_PROBE, [CONTEXT_FABRIC_VALIDATION_PATH, false, PROBE_ACTION_ID]);
    await stop();

    expect(actionCounts.intercepted).toBeGreaterThan(0);
    expect(actionCounts.scanned).toBe(actionCounts.intercepted);
    expect(networkRecords.join("\n")).toMatch(secretPattern);
});

test("scans a server action response for a refresh token too (CHAOS-12304)", async ({
    baseURL,
    page,
}) => {
    const { networkRecords, stop } = await watchNetwork(
        page,
        new URL(baseURL ?? "http://127.0.0.1:3001").origin,
        { mutateActionBody: (body) => `${body}\nacrrt_PLANTED0123456789` },
    );

    await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);
    await page.evaluate(ACTION_PROBE, [CONTEXT_FABRIC_VALIDATION_PATH, false, PROBE_ACTION_ID]);
    await stop();

    expect(networkRecords.join("\n")).toMatch(secretPattern);
    expect(networkRecords.join("\n")).not.toMatch(/fcacr_PLANTED/u);
});

test("a server action response the page cancels mid-stream is still scanned and does not fail the guard", async ({
    baseURL,
    page,
}) => {
    const { networkRecords, stop, actionCounts } = await watchNetwork(
        page,
        new URL(baseURL ?? "http://127.0.0.1:3001").origin,
    );

    await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);
    await page.evaluate(ACTION_PROBE, [CONTEXT_FABRIC_VALIDATION_PATH, true, PROBE_ACTION_ID]);
    await stop();

    expect(actionCounts.intercepted).toBeGreaterThan(0);
    expect(actionCounts.scanned).toBe(actionCounts.intercepted);
    expect(networkRecords.join("\n")).not.toMatch(secretPattern);
});

test("a non-action response still in flight when the guard stops is scanned", async ({
    baseURL,
    page,
}) => {
    // Registered before the guard's own route, so the guard sees the request first and falls back here.
    await page.route("**/__late-response", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 400));
        await route.fulfill({ body: "fcacr_LATE0123456789", contentType: "text/plain" });
    });
    const { networkRecords, stop } = await watchNetwork(
        page,
        new URL(baseURL ?? "http://127.0.0.1:3001").origin,
    );

    await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);
    await page.evaluate(() => {
        void fetch("/__late-response").catch(() => undefined);
    });
    await stop();

    expect(networkRecords.join("\n")).toMatch(secretPattern);
});

type HopSeen = { method: string; hopCookie: boolean; body: string; path: string };
type HopHeaders = { authorization: string; cookie: string };

async function startHopServer(crossOrigin = "") {
    const peers = { back: "", cross: crossOrigin };
    const headersSeen: Record<string, string | string[] | undefined>[] = [];
    const seen: HopSeen[] = [];
    const crossSeen: HopHeaders[] = [];
    const cookieSeen: string[] = [];
    const authSeen: string[] = [];
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
            const path = req.url ?? "";
            const body = Buffer.concat(chunks).toString("utf8");
            if (path === "/start") {
                res.writeHead(303, {
                    location: "/next",
                    "set-cookie": "hopcheck=hop-cookie-marker; Path=/",
                });
                res.end("hop-body fcacr_HOP0123456789");
            } else if (path === "/start307") {
                res.writeHead(307, { location: "/next307" });
                res.end("hop-307-body");
            } else if (path === "/start-query") {
                res.writeHead(303, { location: "/next-q?leak=fcacr_QUERY0123456789" });
                res.end("q");
            } else if (path === "/start300") {
                res.writeHead(300, { location: "/next" });
                res.end("multiple fcacr_MULTI0123456789");
            } else if (path === "/start-cross307") {
                res.writeHead(307, { location: `${peers.cross}/cross-final` });
                res.end("x");
            } else if (path === "/start-same307") {
                res.writeHead(307, { location: "/next-auth" });
                res.end("x");
            } else if (path === "/start-rt") {
                res.writeHead(307, { location: `${peers.cross}/bounce` });
                res.end("x");
            } else if (path === "/bounce") {
                res.writeHead(307, { location: `${peers.back}/next-rt` });
                res.end("x");
            } else if (path === "/start-cross") {
                res.writeHead(302, { location: `${peers.cross}/cross-final` });
                res.end("x");
            } else if (path === "/cross-final") {
                crossSeen.push({
                    authorization: req.headers.authorization ?? "",
                    cookie: req.headers.cookie ?? "",
                });
                res.writeHead(200, { "content-type": "text/plain" });
                res.end("cross-final");
            } else if (path === "/loop") {
                res.writeHead(303, { location: "/loop" });
                res.end("loop");
            } else {
                headersSeen.push({ ...req.headers });
                cookieSeen.push(req.headers.cookie ?? "");
                authSeen.push(req.headers.authorization ?? "");
                seen.push({
                    body,
                    hopCookie: (req.headers.cookie ?? "").includes("hopcheck=hop-cookie-marker"),
                    method: req.method ?? "",
                    path,
                });
                res.writeHead(200, { "content-type": "text/plain" });
                res.end("hop-final");
            }
        });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("hop server has no port");
    const origin = `http://127.0.0.1:${address.port}`;
    const close = () => {
        server.closeAllConnections();
        return new Promise<void>((resolve) => server.close(() => resolve()));
    };
    return { authSeen, close, cookieSeen, crossSeen, headersSeen, origin, peers, seen };
}

const HOP_PREFIX = "/__hop";
const hopUpstream = (hopOrigin: string) => (url: string) => {
    const parsed = new URL(url);
    return parsed.pathname.startsWith(HOP_PREFIX)
        ? `${hopOrigin}${parsed.pathname.slice(HOP_PREFIX.length)}`
        : url;
};
const HOP_POST = async ([path, body, authorization, credentials, bodyHeaders]: [
    string,
    string,
    string?,
    RequestCredentials?,
    Record<string, string>?,
]) => {
    const response = await fetch(path, {
        body,
        ...(credentials ? { credentials } : {}),
        headers: {
            "content-type": "text/plain;charset=UTF-8",
            "next-action": "0".repeat(40),
            ...(authorization ? { authorization } : {}),
            ...bodyHeaders,
        },
        method: "POST",
    });
    await response.text();
    return response.status;
};

test("the body of an intermediate server action redirect is scanned and the next hop is a GET with the cookie", async ({
    baseURL,
    page,
}) => {
    const hop = await startHopServer();
    try {
        const { networkRecords, stop } = await watchNetwork(
            page,
            new URL(baseURL ?? "http://127.0.0.1:3001").origin,
            {
                upstream: hopUpstream(hop.origin),
            },
        );
        await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);
        const status = await page.evaluate(HOP_POST, [`${HOP_PREFIX}/start`, "[]"]);
        await stop();
        expect(status).toBe(200);
        expect(networkRecords.join("\n")).toMatch(secretPattern);
        expect(hop.seen).toEqual([
            {
                body: "",
                hopCookie: true,
                method: "GET",
                path: "/next",
            },
        ]);
    } finally {
        await hop.close();
    }
});

test("a 307 server action redirect keeps the method and the body", async ({ baseURL, page }) => {
    const hop = await startHopServer();
    try {
        const { networkRecords, stop } = await watchNetwork(
            page,
            new URL(baseURL ?? "http://127.0.0.1:3001").origin,
            { upstream: hopUpstream(hop.origin) },
        );
        await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);
        await page.evaluate(HOP_POST, [`${HOP_PREFIX}/start307`, "[307-body]"]);
        await stop();
        expect(hop.seen).toEqual([
            { body: "[307-body]", hopCookie: false, method: "POST", path: "/next307" },
        ]);
        expect(networkRecords.join("\n")).toContain("hop-307-body");
    } finally {
        await hop.close();
    }
});

test("a server action redirect chain over the hop cap fails the guard", async ({
    baseURL,
    page,
}) => {
    const hop = await startHopServer();
    try {
        const { stop } = await watchNetwork(
            page,
            new URL(baseURL ?? "http://127.0.0.1:3001").origin,
            { upstream: hopUpstream(hop.origin) },
        );
        await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);
        await page.evaluate(HOP_POST, [`${HOP_PREFIX}/loop`, "[]"]).catch(() => undefined);
        await stop({ expectedFailures: [/redirect chain longer than 10 hops/u] });
    } finally {
        await hop.close();
    }
});

test("a request that starts while the guard stops is still scanned", async ({ baseURL, page }) => {
    let releaseLate: () => void = () => undefined;
    const lateHeld = new Promise<void>((resolve) => {
        releaseLate = resolve;
    });
    await page.route("**/__late-after-drain", async (route) => {
        await lateHeld;
        await route.fulfill({ body: "fcacr_AFTERDRAIN0123456789", contentType: "text/plain" });
    });
    const { networkRecords, stop } = await watchNetwork(
        page,
        new URL(baseURL ?? "http://127.0.0.1:3001").origin,
        {
            onDrained: async () => {
                const started = page.waitForRequest("**/__late-after-drain");
                await page.evaluate(() => {
                    void fetch("/__late-after-drain").catch(() => undefined);
                });
                await started;
                setImmediate(releaseLate);
            },
        },
    );

    await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);
    await stop();

    expect(networkRecords.join("\n")).toMatch(secretPattern);
});

test("the Location of a redirect hop is recorded with its query string", async ({
    baseURL,
    page,
}) => {
    const hop = await startHopServer();
    try {
        const { networkRecords, stop } = await watchNetwork(
            page,
            new URL(baseURL ?? "http://127.0.0.1:3001").origin,
            { upstream: hopUpstream(hop.origin) },
        );
        await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);
        await page.evaluate(HOP_POST, [`${HOP_PREFIX}/start-query`, "[]"]);
        await stop();
        expect(networkRecords).toContain(`${hop.origin}/next-q?leak=fcacr_QUERY0123456789`);
        expect(networkRecords.join("\n")).toMatch(secretPattern);
    } finally {
        await hop.close();
    }
});

test("a cross-origin redirect hop is recorded and carries no Authorization", async ({
    baseURL,
    page,
}) => {
    const other = await startHopServer();
    const hop = await startHopServer(other.origin);
    const authorization = "Bearer hop-auth-marker";
    try {
        const { networkRecords, stop } = await watchNetwork(
            page,
            new URL(baseURL ?? "http://127.0.0.1:3001").origin,
            { upstream: hopUpstream(hop.origin) },
        );
        await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);
        await page.evaluate(HOP_POST, [`${HOP_PREFIX}/start-cross307`, "[]", authorization]);
        await stop();
        expect(other.crossSeen).toHaveLength(1);
        expect(other.crossSeen[0]?.authorization).toBe("");
        const hopIndex = networkRecords.indexOf(`${other.origin}/cross-final`);
        expect(hopIndex).toBeGreaterThanOrEqual(0);
        const recordedHeaders = JSON.parse(networkRecords[hopIndex + 1] ?? "{}") as Record<
            string,
            string
        >;
        expect(Object.keys(recordedHeaders).map((name) => name.toLowerCase())).not.toContain(
            "authorization",
        );
        expect(recordedHeaders["cookie"] ?? "").toBe(other.crossSeen[0]?.cookie);
    } finally {
        await other.close();
        await hop.close();
    }
});

test("a same-origin 307 hop keeps Authorization and records it", async ({ baseURL, page }) => {
    const hop = await startHopServer();
    const authorization = "Bearer hop-auth-marker";
    try {
        const { networkRecords, stop } = await watchNetwork(
            page,
            new URL(baseURL ?? "http://127.0.0.1:3001").origin,
            { upstream: hopUpstream(hop.origin) },
        );
        await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);
        await page.evaluate(HOP_POST, [`${HOP_PREFIX}/start-same307`, "[]", authorization]);
        await stop();
        expect(hop.authSeen).toEqual([authorization]);
        const hopIndex = networkRecords.indexOf(`${hop.origin}/next-auth`);
        const recordedHeaders = JSON.parse(networkRecords[hopIndex + 1] ?? "{}") as Record<
            string,
            string
        >;
        expect(recordedHeaders["authorization"]).toBe(authorization);
    } finally {
        await hop.close();
    }
});

test("a hop gets the jar cookies of its own origin, path and scheme, and they are recorded", async ({
    baseURL,
    page,
}) => {
    const hop = await startHopServer();
    try {
        const { networkRecords, stop } = await watchNetwork(
            page,
            new URL(baseURL ?? "http://127.0.0.1:3001").origin,
            { upstream: hopUpstream(hop.origin) },
        );
        await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);
        await page.context().addCookies([
            { domain: "127.0.0.1", name: "jarin", path: "/next", value: "jar-in-marker" },
            { domain: "127.0.0.1", name: "jarpath", path: "/other", value: "jar-path-marker" },
            {
                domain: "127.0.0.1",
                name: "jarsecure",
                path: "/",
                secure: true,
                value: "jar-secure-marker",
            },
        ]);
        await page.evaluate(HOP_POST, [`${HOP_PREFIX}/start`, "[]"]);
        await stop();
        expect(hop.cookieSeen).toHaveLength(1);
        expect(hop.cookieSeen[0]).toContain("jarin=jar-in-marker");
        expect(hop.cookieSeen[0]).not.toContain("jarpath");
        expect(hop.cookieSeen[0]).not.toContain("jarsecure");
        const hopIndex = networkRecords.indexOf(`${hop.origin}/next`);
        const recordedHeaders = JSON.parse(networkRecords[hopIndex + 1] ?? "{}") as Record<
            string,
            string
        >;
        expect(recordedHeaders["cookie"]).toBe(hop.cookieSeen[0]);
    } finally {
        await hop.close();
    }
});

test("a 300 response with a Location is not followed and its body is scanned", async ({
    baseURL,
    page,
}) => {
    const hop = await startHopServer();
    try {
        const { networkRecords, stop } = await watchNetwork(
            page,
            new URL(baseURL ?? "http://127.0.0.1:3001").origin,
            { upstream: hopUpstream(hop.origin) },
        );
        await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);
        const status = await page.evaluate(HOP_POST, [`${HOP_PREFIX}/start300`, "[]"]);
        await stop();
        expect(status).toBe(300);
        expect(hop.seen).toEqual([]);
        expect(networkRecords.join("\n")).toMatch(secretPattern);
    } finally {
        await hop.close();
    }
});

test("a record task that never ends fails the guard by name at the deadline", async ({
    baseURL,
    page,
}) => {
    const { stop } = await watchNetwork(page, new URL(baseURL ?? "http://127.0.0.1:3001").origin, {
        drainTimeoutMs: 1_500,
        recordTask: () => new Promise<void>(() => undefined),
    });
    await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);
    const started = Date.now();
    await expect(stop()).rejects.toThrow(/record tasks still running/u);
    expect(Date.now() - started).toBeLessThan(1_500 + 1_000);
});

test("a request still pending at the stop deadline fails the guard", async ({ baseURL, page }) => {
    test.setTimeout(45_000);
    // The handler returns without answering: the request stays pending, and unrouteAll does not wait for it.
    await page.route("**/__hang", () => undefined);
    const { stop } = await watchNetwork(page, new URL(baseURL ?? "http://127.0.0.1:3001").origin);
    await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);
    const started = page.waitForRequest("**/__hang");
    await page.evaluate(() => {
        void fetch("/__hang").catch(() => undefined);
    });
    await started;
    await expect(stop()).rejects.toThrow(/requests still in flight/u);
});

const planCookie = (name: string, path: string, value: string) => ({
    domain: "127.0.0.1",
    name,
    path,
    value,
});

test("a cross-origin hop gets no cookie under same-origin credentials, even with a cookie for its path", async ({
    baseURL,
    page,
}) => {
    const other = await startHopServer();
    const hop = await startHopServer(other.origin);
    try {
        const { networkRecords, stop } = await watchNetwork(
            page,
            new URL(baseURL ?? "http://127.0.0.1:3001").origin,
            { upstream: hopUpstream(hop.origin) },
        );
        await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);
        await page.context().addCookies([planCookie("destjar", "/cross-final", "dest-jar-marker")]);
        await page.evaluate(HOP_POST, [`${HOP_PREFIX}/start-cross307`, "[]"]);
        await stop();
        expect(other.crossSeen).toHaveLength(1);
        expect(other.crossSeen[0]?.cookie).toBe("");
        expect(networkRecords.join("\n")).not.toContain("dest-jar-marker");
    } finally {
        await other.close();
        await hop.close();
    }
});

test("a hop back to the first origin after a cross-origin hop gets no cookie", async ({
    baseURL,
    page,
}) => {
    const other = await startHopServer();
    const hop = await startHopServer(other.origin);
    other.peers.back = hop.origin;
    try {
        const { stop } = await watchNetwork(
            page,
            new URL(baseURL ?? "http://127.0.0.1:3001").origin,
            { upstream: hopUpstream(hop.origin) },
        );
        await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);
        await page.context().addCookies([planCookie("rtjar", "/", "rt-jar-marker")]);
        await page.evaluate(HOP_POST, [`${HOP_PREFIX}/start-rt`, "[]"]);
        await stop();
        expect(hop.cookieSeen).toEqual([""]);
    } finally {
        await other.close();
        await hop.close();
    }
});

test("credentials include sends the cookie that is scoped to a cross-origin hop and records it", async ({
    baseURL,
    page,
}) => {
    const other = await startHopServer();
    const hop = await startHopServer(other.origin);
    try {
        const { networkRecords, stop } = await watchNetwork(
            page,
            new URL(baseURL ?? "http://127.0.0.1:3001").origin,
            { credentials: "include", upstream: hopUpstream(hop.origin) },
        );
        await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);
        await page.context().addCookies([planCookie("destjar", "/cross-final", "dest-jar-marker")]);
        await page.evaluate(HOP_POST, [`${HOP_PREFIX}/start-cross307`, "[]", undefined, "include"]);
        await stop();
        expect(other.crossSeen).toHaveLength(1);
        expect(other.crossSeen[0]?.cookie).toContain("destjar=dest-jar-marker");
        const hopIndex = networkRecords.indexOf(`${other.origin}/cross-final`);
        const recordedHeaders = JSON.parse(networkRecords[hopIndex + 1] ?? "{}") as Record<
            string,
            string
        >;
        expect(recordedHeaders["cookie"]).toBe(other.crossSeen[0]?.cookie);
    } finally {
        await other.close();
        await hop.close();
    }
});

test("credentials omit sends no cookie on any hop", async ({ baseURL, page }) => {
    const hop = await startHopServer();
    try {
        const { stop } = await watchNetwork(
            page,
            new URL(baseURL ?? "http://127.0.0.1:3001").origin,
            { credentials: "omit", upstream: hopUpstream(hop.origin) },
        );
        await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);
        await page.context().addCookies([planCookie("omitjar", "/", "omit-jar-marker")]);
        await page.evaluate(HOP_POST, [`${HOP_PREFIX}/start`, "[]", undefined, "omit"]);
        await stop();
        expect(hop.cookieSeen).toEqual([""]);
    } finally {
        await hop.close();
    }
});

test("a POST turned into a GET carries none of the five body headers and no Content-Length", async ({
    baseURL,
    page,
}) => {
    const hop = await startHopServer();
    try {
        const { networkRecords, stop } = await watchNetwork(
            page,
            new URL(baseURL ?? "http://127.0.0.1:3001").origin,
            { upstream: hopUpstream(hop.origin) },
        );
        await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);
        await page.evaluate(HOP_POST, [
            `${HOP_PREFIX}/start`,
            "[]",
            undefined,
            undefined,
            {
                "content-encoding": "identity",
                "content-language": "en",
                "content-location": "/somewhere",
            },
        ]);
        await stop();
        expect(hop.headersSeen).toHaveLength(1);
        const seenNames = Object.keys(hop.headersSeen[0] ?? {});
        for (const name of BODY_HEADERS) expect(seenNames).not.toContain(name);
        expect(hop.seen[0]?.body).toBe("");
        const hopIndex = networkRecords.indexOf(`${hop.origin}/next`);
        const recordedNames = Object.keys(
            JSON.parse(networkRecords[hopIndex + 1] ?? "{}") as Record<string, string>,
        );
        for (const name of BODY_HEADERS) expect(recordedNames).not.toContain(name);
    } finally {
        await hop.close();
    }
});

test("a request seen without a recorded response fails the guard by name", async ({
    baseURL,
    page,
}) => {
    await page.route("**/__no-response-event", (route) =>
        route.fulfill({ body: "ok", contentType: "text/plain" }),
    );
    const { stop } = await watchNetwork(page, new URL(baseURL ?? "http://127.0.0.1:3001").origin, {
        drainTimeoutMs: 1_500,
        ignoreResponseEvents: (url) => url.endsWith("/__no-response-event"),
    });
    await page.goto(CONTEXT_FABRIC_VALIDATION_PATH);
    await page.evaluate(async () => {
        await fetch("/__no-response-event");
    });
    await expect(stop()).rejects.toThrow(/request seen but not recorded/u);
});

// CHAOS-12304 (c3 of the T13 split; design §7): ACR's browser tokens on the c2 flow. ACR runs on its
// own loopback origin (`tests/mocks/acr-browser-client.ts`), so the page talks to it cross-origin
// as it will in production. The observer records every request, response, console message and
// storage entry of the page. `tokenBoundaryViolations` (`tests/mocks/acr-token-boundary.ts`, with
// its own unit tests) names each place a token is where it must not be.
const PROBE_PATH = "/__acr-boundary-probe";

function observeTokens(page: Page) {
    const observed: Observed[] = [];
    const tasks: Promise<void>[] = [];
    const unreadable: string[] = [];
    page.on("request", (request) => {
        tasks.push(
            request.allHeaders().then((headers) => {
                observed.push({
                    kind: "request",
                    url: request.url(),
                    method: request.method(),
                    headers,
                    body: request.postData() ?? "",
                });
            }),
        );
    });
    // Headers when a response starts; the body only once it is complete (requestfinished). A body
    // that never ends (a long-lived stream) is not read: its URL and headers are still checked.
    page.on("response", (response) => {
        tasks.push(
            response.allHeaders().then((headers) => {
                observed.push({
                    kind: "response",
                    url: response.url(),
                    status: response.status(),
                    headers,
                    body: "",
                });
            }),
        );
    });
    page.on("requestfinished", (request) => {
        tasks.push(
            (async () => {
                const response = await request.response();
                if (response === null) return;
                const status = response.status();
                if (status >= 300 && status < 400) return;
                try {
                    const body = await response.text();
                    observed.push({
                        kind: "response",
                        url: response.url(),
                        status,
                        headers: {},
                        body,
                    });
                } catch {
                    unreadable.push(response.url());
                }
            })(),
        );
    });
    page.on("console", (message) => observed.push({ kind: "console", text: message.text() }));
    /**
     * Waits until every record started so far (and any it started) is in `observed`, for at most
     * 10 s. A record still running then fails the scenario by name.
     */
    const settle = async () => {
        const deadline = Date.now() + 10_000;
        for (let settled = -1; settled !== tasks.length;) {
            settled = tasks.length;
            let timer: ReturnType<typeof setTimeout> | undefined;
            const done = await Promise.race([
                Promise.all(tasks).then(() => true),
                new Promise<boolean>((resolve) => {
                    timer = setTimeout(() => resolve(false), Math.max(deadline - Date.now(), 0));
                }),
            ]);
            clearTimeout(timer);
            expect(done, "token observer records still running after 10 s").toBe(true);
        }
    };
    const finish = async () => {
        await settle();
        const storage = await page.evaluate(() => ({
            local: { ...window.localStorage },
            session: { ...window.sessionStorage },
        }));
        for (const [key, value] of Object.entries(storage.local)) {
            observed.push({ kind: "storage", area: "local", key, value });
        }
        for (const [key, value] of Object.entries(storage.session)) {
            observed.push({ kind: "storage", area: "session", key, value });
        }
        return { observed, unreadable };
    };
    return { observed, settle, finish };
}

type Plant = (tokens: { readonly access: string; readonly refresh: string }) => Promise<void>;

/**
 * The c2 flow, then the calls the next tickets make with its tokens: one data call with the access
 * token (T14) and one revocation with the refresh token (c4).
 */
async function browserTokenScenario(page: Page, baseURL: string | undefined, plant?: Plant) {
    const web = new URL(baseURL ?? "http://127.0.0.1:3001").origin;
    // Another loopback origin, already in the app's CSP. The routes answer it, not a server.
    const issuer = ACR_E2E_ISSUER;
    const client = await installCrossOriginAcr(page.context(), web, issuer);
    await page
        .context()
        .route(`${web}${PROBE_PATH}**`, (route) => route.fulfill({ status: 204, body: "" }));
    const watch = observeTokens(page);

    await page.goto("/ask-dev/oauth/start?return=%2Fdashboard");
    await page.waitForURL((url) => url.pathname === "/dashboard");
    await watch.settle();

    // The access token ACR issued: from its own /token answer, as the page received it.
    const answers = client.answers
        .filter((item) => item.url === client.endpoints.tokenEndpoint && item.status === 200)
        .map((item) => item.body)
        .join("\n");
    const [access] = accessTokensIn(answers);
    expect(access, "the page received an access token from ACR's /token").toMatch(
        /^fcacr_[A-Za-z0-9_-]{43}$/u,
    );
    const family = await page.evaluate(
        () =>
            JSON.parse(window.sessionStorage.getItem("ask-dev:acr-family") ?? "null") as {
                refreshToken: string;
                clientId: string;
            } | null,
    );
    expect(family?.refreshToken, "the c2 flow stored its family").toMatch(
        /^acrrt_[A-Za-z0-9_-]{43}$/u,
    );

    await page.evaluate(
        async ([acr, token]) => {
            await fetch(`${acr}/api/v1/context-fabric/capabilities`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "X-ACR-Resource": acr,
                    "X-ACR-Client-Version": "0.1.0",
                },
                credentials: "omit",
            });
        },
        [issuer, access!] as const,
    );
    await page.evaluate(
        async ([endpoint, token, clientId]) => {
            await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({ token, client_id: clientId }),
                credentials: "omit",
            });
        },
        [client.endpoints.revocationEndpoint, family!.refreshToken, family!.clientId] as const,
    );
    await plant?.({ access: access!, refresh: family!.refreshToken });

    const { observed, unreadable } = await watch.finish();
    // ACR's answers with their bodies, as the route gave them: the page may have navigated away
    // before its own copy could be read back.
    for (const answer of client.answers) observed.push({ kind: "response", ...answer });
    return {
        violations: tokenBoundaryViolations(observed, client.endpoints),
        observed,
        unreadable,
        endpoints: client.endpoints,
        access: access!,
        refresh: family!.refreshToken,
    };
}

test.describe("ACR browser tokens on the c2 flow (CHAOS-12304)", () => {
    test("every token stays where it belongs: Authorization to ACR, /token, /revoke, the family", async ({
        baseURL,
        page,
    }) => {
        const run = await browserTokenScenario(page, baseURL);
        expect(run.violations).toEqual([]);
        // Every unreadable body is web's own; ACR's bodies come from the route that answered them.
        expect(run.unreadable.filter((url) => !url.startsWith(run.endpoints.issuer))).toEqual([]);

        // The scenario saw each allowed placement, so an empty list is not an observer that saw nothing.
        const requests = run.observed.filter((item) => item.kind === "request");
        expect(
            requests.some(
                (item) =>
                    item.url.startsWith(`${run.endpoints.issuer}/api/`) &&
                    item.headers.authorization === `Bearer ${run.access}`,
            ),
            "a data call carried the access token in Authorization to the ACR origin",
        ).toBe(true);
        expect(
            requests.some(
                (item) =>
                    item.url === run.endpoints.revocationEndpoint &&
                    item.body.includes(run.refresh),
            ),
            "the revocation carried the refresh token in its body",
        ).toBe(true);
        expect(
            run.observed.some(
                (item) =>
                    item.kind === "storage" &&
                    item.area === "session" &&
                    item.key === "ask-dev:acr-family" &&
                    item.value.includes(run.refresh),
            ),
            "the family holds the refresh token in sessionStorage",
        ).toBe(true);
    });

    // Each planted leak is red by its own name, and by nothing else.
    const plants: [string, (page: Page) => Plant, string][] = [
        [
            "an access token in a URL",
            (page) =>
                async ({ access }) => {
                    await page.evaluate(
                        async ([path, token]) => {
                            await fetch(`${path}?t=${token}`);
                        },
                        [PROBE_PATH, access] as const,
                    );
                },
            "access token in a URL",
        ],
        [
            "an access token in localStorage",
            (page) =>
                async ({ access }) => {
                    await page.evaluate(
                        (token) => window.localStorage.setItem("probe", token),
                        access,
                    );
                },
            "access token in localStorage",
        ],
        [
            "an access token sent to another origin (web's own server)",
            (page) =>
                async ({ access }) => {
                    await page.evaluate(
                        async ([path, token]) => {
                            await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
                        },
                        [PROBE_PATH, access] as const,
                    );
                },
            "access token to another origin",
        ],
        [
            "an access token in the console",
            (page) =>
                async ({ access }) => {
                    await page.evaluate((token) => console.info(`probe ${token}`), access);
                },
            "access token in the console",
        ],
        [
            "a refresh token in a non-ACR request",
            (page) =>
                async ({ refresh }) => {
                    await page.evaluate(
                        async ([path, token]) => {
                            await fetch(path, { method: "POST", body: token });
                        },
                        [PROBE_PATH, refresh] as const,
                    );
                },
            "refresh token in a non-ACR request",
        ],
    ];

    for (const [title, plant, name] of plants) {
        test(`planted: ${title} is red as "${name}"`, async ({ baseURL, page }) => {
            const run = await browserTokenScenario(page, baseURL, plant(page));
            expect(run.violations).toEqual([name]);
        });
    }
});
