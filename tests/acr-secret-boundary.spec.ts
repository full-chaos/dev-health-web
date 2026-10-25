import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { expect, test, type Page, type Request, type Response } from "@playwright/test";

const CONTEXT_FABRIC_VALIDATION_PATH = "/superadmin/context-fabric/validation";

const PROBE_ACTION_ID = "0".repeat(40);
const STOP_DRAIN_TIMEOUT_MS = 10_000;
const MAX_REDIRECT_HOPS = 10;
const DRAIN_SETTLE_MS = 50;

const secretPattern =
    /BEGIN (?:EC |RSA )?PRIVATE KEY|fcacr_[A-Za-z0-9]|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/u;
const clientChunkForbiddenPattern =
    /ACR_API_ORIGIN|ACR_REQUEST_TIMEOUT_MS|ACR_WEB_ASSERTION_(?:KEY_FILE|KID|ISSUER|AUDIENCE)|BEGIN (?:EC |RSA )?PRIVATE KEY|fcacr_[A-Za-z0-9]|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/u;

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
// the URL that is really fetched; `onDrained` runs once
// stop() has seen no pending request, so a test can start a request at the worst moment.
type WatchOptions = {
    mutateActionBody?: (body: string) => string;
    upstream?: (url: string) => string;
    onDrained?: () => Promise<void>;
};

async function watchNetwork(page: Page, origin: string, options: WatchOptions = {}) {
    const directAcrRequests: string[] = [];
    const networkRecords: string[] = [];
    const networkRecordTasks: Promise<void>[] = [];
    const interceptedActions = new Set<Request>();
    const actionCounts = { intercepted: 0, scanned: 0, pageOwn: 0 };
    const pendingRequests = new Set<Request>();
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
            const baseHeaders = request.headers();
            let cookieHeader: string | undefined = baseHeaders["cookie"];
            let response = await route.fetch({ maxRedirects: 0, url: target });
            for (let hop = 0; ; hop += 1) {
                const body = await response.text();
                const status = response.status();
                const location = response.headers()["location"];
                const isRedirect = status >= 300 && status < 400 && location !== undefined;
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
                target = new URL(location, response.url()).toString();
                if (status === 303 || ((status === 301 || status === 302) && method === "POST")) {
                    method = "GET";
                    postData = null;
                }
                const headers = { ...baseHeaders };
                // route.fetch does not store the Set-Cookie of a hop; a browser would, so the next hop gets it.
                for (const header of response.headersArray()) {
                    if (header.name.toLowerCase() !== "set-cookie") continue;
                    const [pair = ""] = header.value.split(";");
                    const name = pair.split("=")[0]?.trim() ?? "";
                    if (name === "") continue;
                    const kept = (cookieHeader ?? "")
                        .split("; ")
                        .filter((cookie) => cookie !== "" && !cookie.startsWith(`${name}=`));
                    cookieHeader = [...kept, pair.trim()].join("; ");
                }
                if (cookieHeader !== undefined) headers["cookie"] = cookieHeader;
                if (postData === null) {
                    delete headers["content-type"];
                    delete headers["content-length"];
                }
                networkRecords.push(
                    target,
                    JSON.stringify(headers),
                    postData?.toString("utf8") ?? "",
                );
                response = await route.fetch({
                    headers,
                    maxRedirects: 0,
                    method,
                    postData: postData ?? Buffer.alloc(0),
                    url: target,
                });
            }
        },
    );
    const onRequest = (request: Request) => {
        pendingRequests.add(request);
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
    page.on("requestfailed", onRequestDone);

    // Stop recording: first let every request that is still in flight finish and be recorded while the
    // listeners are attached (a response that arrives after the listener is removed would never be
    // scanned), then detach and wait for the records already started. The check repeats until no request
    // is pending after the records settled, so a request that starts during the drain is covered too.
    // Requests that do not finish in time fail the guard instead of being skipped.
    const stop = async (stopOptions: { expectedFailures?: RegExp[] } = {}) => {
        const deadline = Date.now() + STOP_DRAIN_TIMEOUT_MS;
        const drain = async () => {
            while (pendingRequests.size > 0 && Date.now() < deadline) {
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
        };
        await drain();
        if (options.onDrained) await options.onDrained();
        let settled = false;
        while (!settled) {
            await drain();
            await Promise.all(networkRecordTasks);
            await new Promise((resolve) => setTimeout(resolve, DRAIN_SETTLE_MS));
            await Promise.all(networkRecordTasks);
            settled = pendingRequests.size === 0 || Date.now() >= deadline;
        }
        const unfinished = pendingRequests.size;
        page.off("request", onRequest);
        page.off("response", onResponse);
        page.off("requestfinished", onRequestDone);
        page.off("requestfailed", onRequestDone);
        if (unfinished > 0) {
            // Waiting for the handlers or the record tasks could hang on the very request that is pending.
            await page.unrouteAll({ behavior: "ignoreErrors" });
            expect(unfinished, "requests still in flight when the guard stopped").toBe(0);
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
    const seen: HopSeen[] = [];
    const crossSeen: HopHeaders[] = [];
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
            } else if (path === "/start-cross") {
                res.writeHead(302, { location: `${crossOrigin}/cross-final` });
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
    return { close, crossSeen, origin, seen };
}

const HOP_PREFIX = "/__hop";
const hopUpstream = (hopOrigin: string) => (url: string) => {
    const parsed = new URL(url);
    return parsed.pathname.startsWith(HOP_PREFIX)
        ? `${hopOrigin}${parsed.pathname.slice(HOP_PREFIX.length)}`
        : url;
};
const HOP_POST = async ([path, body, authorization]: [string, string, string?]) => {
    const response = await fetch(path, {
        body,
        headers: {
            "content-type": "text/plain;charset=UTF-8",
            "next-action": "0".repeat(40),
            ...(authorization ? { authorization } : {}),
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

test("a cross-origin redirect hop is recorded with the headers it actually sent", async ({
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
        await page.evaluate(HOP_POST, [`${HOP_PREFIX}/start-cross`, "[]", authorization]);
        await stop();
        expect(other.crossSeen).toHaveLength(1);
        const hopIndex = networkRecords.indexOf(`${other.origin}/cross-final`);
        expect(hopIndex).toBeGreaterThanOrEqual(0);
        const recordedHeaders = JSON.parse(networkRecords[hopIndex + 1] ?? "{}") as Record<
            string,
            string
        >;
        expect(recordedHeaders["authorization"] ?? "").toBe(other.crossSeen[0]?.authorization);
        expect(recordedHeaders["cookie"] ?? "").toBe(other.crossSeen[0]?.cookie);
    } finally {
        await other.close();
        await hop.close();
    }
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
