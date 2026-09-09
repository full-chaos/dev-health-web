import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const nextAuthReactEntry = require.resolve("next-auth/react");
const nextAuthClientUrl = pathToFileURL(
    path.join(path.dirname(nextAuthReactEntry), "lib", "client.js"),
).href;
const { fetchData } = await import(nextAuthClientUrl);

const clientConfig = {
    basePath: "/api/auth",
    basePathServer: "/api/auth",
    baseUrl: "http://example.test",
    baseUrlServer: "http://example.test",
};
const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
};
const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

function deferred() {
    let reject;
    let resolve;
    const promise = new Promise((nextResolve, nextReject) => {
        resolve = nextResolve;
        reject = nextReject;
    });
    return { promise, reject, resolve };
}

function useBrowserRuntime() {
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {},
        writable: true,
    });
}

function useServerRuntime() {
    delete globalThis.window;
}

afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else Object.defineProperty(globalThis, "window", originalWindow);
    vi.clearAllMocks();
    vi.restoreAllMocks();
});

describe.sequential("next-auth session request ordering", () => {
    it("does not dispatch a session POST until the earlier session GET response body is parsed", async () => {
        useBrowserRuntime();
        const getBody = deferred();
        const getBodyReadStarted = deferred();
        const postBody = deferred();
        const fetchSpy = vi
            .fn()
            .mockResolvedValueOnce({
                json: () => {
                    getBodyReadStarted.resolve();
                    return getBody.promise;
                },
                ok: true,
            })
            .mockResolvedValueOnce({ json: () => postBody.promise, ok: true });
        globalThis.fetch = fetchSpy;

        const getSession = fetchData("session", clientConfig, logger);
        let updateSession;

        try {
            await getBodyReadStarted.promise;
            updateSession = fetchData("session", clientConfig, logger, {
                body: { data: { onboardComplete: { org_id: "new-org" } } },
            });
            await Promise.resolve();
            expect(fetchSpy).toHaveBeenCalledOnce();
            expect(fetchSpy).toHaveBeenLastCalledWith("/api/auth/session", {
                headers: { "Content-Type": "application/json" },
                signal: expect.any(AbortSignal),
            });

            getBody.resolve({ user: { org_id: "old-org" } });
            await expect(getSession).resolves.toEqual({ user: { org_id: "old-org" } });

            await Promise.resolve();
            expect(fetchSpy).toHaveBeenCalledTimes(2);
            expect(fetchSpy).toHaveBeenLastCalledWith("/api/auth/session", {
                body: JSON.stringify({ data: { onboardComplete: { org_id: "new-org" } } }),
                headers: { "Content-Type": "application/json" },
                method: "POST",
                signal: expect.any(AbortSignal),
            });

            postBody.resolve({ user: { org_id: "new-org" } });
            await expect(updateSession).resolves.toEqual({ user: { org_id: "new-org" } });
        } finally {
            getBodyReadStarted.resolve();
            getBody.resolve({ user: { org_id: "old-org" } });
            postBody.resolve({ user: { org_id: "new-org" } });
            await Promise.allSettled([getSession, updateSession].filter(Boolean));
        }
    });

    it("releases the session queue after a failed request returns null", async () => {
        useBrowserRuntime();
        const failedFetch = deferred();
        const failedFetchStarted = deferred();
        const updateBody = deferred();
        const fetchSpy = vi
            .fn()
            .mockImplementationOnce(() => {
                failedFetchStarted.resolve();
                return failedFetch.promise;
            })
            .mockResolvedValueOnce({ json: () => updateBody.promise, ok: true });
        globalThis.fetch = fetchSpy;

        const failedSession = fetchData("session", clientConfig, logger);
        let updateSession;

        try {
            await failedFetchStarted.promise;
            updateSession = fetchData("session", clientConfig, logger, {
                body: { data: { activeOrg: { user: { org_id: "new-org" } } } },
            });
            await Promise.resolve();
            expect(fetchSpy).toHaveBeenCalledOnce();

            failedFetch.reject(new Error("session read failed"));
            await expect(failedSession).resolves.toBeNull();

            await Promise.resolve();
            expect(fetchSpy).toHaveBeenCalledTimes(2);
            updateBody.resolve({ user: { org_id: "new-org" } });
            await expect(updateSession).resolves.toEqual({ user: { org_id: "new-org" } });
        } finally {
            failedFetchStarted.resolve();
            failedFetch.reject(new Error("session read failed"));
            updateBody.resolve({ user: { org_id: "new-org" } });
            await Promise.allSettled([failedSession, updateSession].filter(Boolean));
        }
    });

    it("does not serialize non-session requests or server-side session reads", async () => {
        useBrowserRuntime();
        const browserSessionBody = deferred();
        const browserSessionBodyReadStarted = deferred();
        const nonSessionBody = deferred();
        const serverSessionBody = deferred();
        const fetchSpy = vi
            .fn()
            .mockResolvedValueOnce({
                json: () => {
                    browserSessionBodyReadStarted.resolve();
                    return browserSessionBody.promise;
                },
                ok: true,
            })
            .mockResolvedValueOnce({ json: () => nonSessionBody.promise, ok: true })
            .mockResolvedValueOnce({ json: () => serverSessionBody.promise, ok: true });
        globalThis.fetch = fetchSpy;

        const browserSession = fetchData("session", clientConfig, logger);
        let csrf;
        let serverSession;

        try {
            await browserSessionBodyReadStarted.promise;
            csrf = fetchData("csrf", clientConfig, logger);
            useServerRuntime();
            serverSession = fetchData("session", clientConfig, logger);
            expect(fetchSpy).toHaveBeenCalledTimes(3);
            expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
                "/api/auth/session",
                "/api/auth/csrf",
                "http://example.test/api/auth/session",
            ]);
            expect(fetchSpy.mock.calls.map(([, options]) => "signal" in options)).toEqual([
                true,
                false,
                false,
            ]);

            browserSessionBody.resolve({ user: { org_id: "browser-org" } });
            nonSessionBody.resolve({ csrfToken: "csrf-token" });
            serverSessionBody.resolve({ user: { org_id: "server-org" } });
            await expect(Promise.all([browserSession, csrf, serverSession])).resolves.toEqual([
                { user: { org_id: "browser-org" } },
                { csrfToken: "csrf-token" },
                { user: { org_id: "server-org" } },
            ]);
        } finally {
            browserSessionBodyReadStarted.resolve();
            browserSessionBody.resolve({ user: { org_id: "browser-org" } });
            nonSessionBody.resolve({ csrfToken: "csrf-token" });
            serverSessionBody.resolve({ user: { org_id: "server-org" } });
            await Promise.allSettled([browserSession, csrf, serverSession].filter(Boolean));
        }
    });

    it("aborts a stalled session request on the timeout and releases the queue", async () => {
        useBrowserRuntime();
        // AbortSignal.timeout() runs on a native timer that fake timers cannot
        // advance, so drive the abort through a controller we own instead.
        let timeoutController;
        const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
            timeoutController = new AbortController();
            return timeoutController.signal;
        });
        const stalledFetchStarted = deferred();
        const updateBody = deferred();
        const fetchSpy = vi
            .fn()
            .mockImplementationOnce((_url, options) => {
                stalledFetchStarted.resolve();
                return new Promise((_resolve, reject) => {
                    options.signal.addEventListener("abort", () => {
                        reject(options.signal.reason);
                    });
                });
            })
            .mockResolvedValueOnce({ json: () => updateBody.promise, ok: true });
        globalThis.fetch = fetchSpy;

        const stalledSession = fetchData("session", clientConfig, logger);
        let updateSession;

        try {
            await stalledFetchStarted.promise;
            expect(timeoutSpy).toHaveBeenCalledWith(10_000);

            updateSession = fetchData("session", clientConfig, logger, {
                body: { data: { activeOrg: { user: { org_id: "new-org" } } } },
            });
            await Promise.resolve();
            expect(fetchSpy).toHaveBeenCalledOnce();

            timeoutController.abort(new DOMException("The operation timed out.", "TimeoutError"));
            await expect(stalledSession).resolves.toBeNull();

            await Promise.resolve();
            expect(fetchSpy).toHaveBeenCalledTimes(2);
            updateBody.resolve({ user: { org_id: "new-org" } });
            await expect(updateSession).resolves.toEqual({ user: { org_id: "new-org" } });
        } finally {
            stalledFetchStarted.resolve();
            timeoutController?.abort(new DOMException("The operation timed out.", "TimeoutError"));
            updateBody.resolve({ user: { org_id: "new-org" } });
            await Promise.allSettled([stalledSession, updateSession].filter(Boolean));
        }
    });
});
