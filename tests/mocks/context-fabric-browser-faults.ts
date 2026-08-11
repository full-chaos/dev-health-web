import type { Page, Request } from "@playwright/test";

const AUTH_SESSION_FETCH_ERROR =
    "Failed to fetch. Read more at https://errors.authjs.dev#autherror";
const SESSION_REQUEST_ABORTED = "net::ERR_ABORTED";

export type BrowserFaultEvent =
    | { readonly kind: "console-error"; readonly message: string }
    | { readonly kind: "page-error"; readonly message: string }
    | { readonly kind: "session-request-failed"; readonly errorText: string }
    | { readonly kind: "session-response"; readonly status: number };

export type BrowserFaultLog = {
    readonly events: readonly BrowserFaultEvent[];
    readonly settle: () => Promise<void>;
};

type SessionRequestTracker<RequestToken extends object> = {
    readonly started: (request: RequestToken) => void;
    readonly failed: (request: RequestToken, errorText: string) => void;
    readonly finished: (request: RequestToken) => void;
    readonly responded: (request: RequestToken, status: number) => void;
    readonly mainFrameNavigated: () => void;
    readonly waitForPending: () => Promise<void>;
};

export type BrowserFaultSummary = {
    readonly consoleErrors: readonly string[];
    readonly pageErrors: readonly string[];
    readonly sessionRequestFailures: readonly string[];
    readonly sessionResponseFailures: readonly number[];
};

export const EMPTY_BROWSER_FAULTS = {
    consoleErrors: [],
    pageErrors: [],
    sessionRequestFailures: [],
    sessionResponseFailures: [],
} as const satisfies BrowserFaultSummary;

function assertNever(event: never): never {
    throw new Error(`Unexpected browser fault event: ${JSON.stringify(event)}`);
}

function isSessionRequest(url: string, method: string): boolean {
    return new URL(url).pathname === "/api/auth/session" && method === "GET";
}

function isAuthSessionFetchError(message: string): boolean {
    return message.includes(AUTH_SESSION_FETCH_ERROR) && message.includes("._getSession");
}

export function createSessionRequestTracker<RequestToken extends object>(
    events: BrowserFaultEvent[],
): SessionRequestTracker<RequestToken> {
    let documentGeneration = 0;
    const pending = new Map<RequestToken, number>();
    const navigationSettled = new WeakSet<RequestToken>();
    const settlementWaiters = new Set<() => void>();
    const resolveIfSettled = (): void => {
        if (pending.size > 0) return;
        for (const resolve of settlementWaiters) resolve();
        settlementWaiters.clear();
    };
    const settle = (request: RequestToken): boolean => {
        if (!pending.delete(request)) return false;
        resolveIfSettled();
        return true;
    };

    return {
        started: (request) => pending.set(request, documentGeneration),
        failed: (request, errorText) => {
            if (!settle(request)) return;
            events.push({ kind: "session-request-failed", errorText });
        },
        finished: (request) => {
            settle(request);
        },
        responded: (request, status) => {
            if (navigationSettled.has(request)) return;
            events.push({ kind: "session-response", status });
        },
        mainFrameNavigated: () => {
            documentGeneration += 1;
            for (const [request, generation] of pending) {
                if (generation >= documentGeneration) continue;
                pending.delete(request);
                navigationSettled.add(request);
                events.push({
                    kind: "session-request-failed",
                    errorText: SESSION_REQUEST_ABORTED,
                });
            }
            resolveIfSettled();
        },
        waitForPending: () => {
            if (pending.size === 0) return Promise.resolve();
            return new Promise((resolve) => settlementWaiters.add(resolve));
        },
    };
}

export function recordBrowserFaults(page: Page): BrowserFaultLog {
    const events: BrowserFaultEvent[] = [];
    const sessionRequests = createSessionRequestTracker<Request>(events);

    page.on("console", (message) => {
        if (message.type() === "error") {
            events.push({ kind: "console-error", message: message.text() });
        }
    });
    page.on("pageerror", (error) => {
        events.push({ kind: "page-error", message: error.message });
    });
    page.on("request", (request) => {
        if (isSessionRequest(request.url(), request.method())) {
            sessionRequests.started(request);
        }
    });
    page.on("requestfailed", (request) => {
        if (isSessionRequest(request.url(), request.method())) {
            sessionRequests.failed(request, request.failure()?.errorText ?? "");
        }
    });
    page.on("requestfinished", (request) => {
        if (isSessionRequest(request.url(), request.method())) {
            sessionRequests.finished(request);
        }
    });
    page.on("response", (response) => {
        if (isSessionRequest(response.url(), response.request().method())) {
            sessionRequests.responded(response.request(), response.status());
        }
    });
    page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) {
            sessionRequests.mainFrameNavigated();
        }
    });
    return {
        events,
        settle: async () => {
            await sessionRequests.waitForPending();
            await page.evaluate(
                () =>
                    new Promise<void>((resolve) => {
                        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
                    }),
            );
            await sessionRequests.waitForPending();
        },
    };
}

export function rawBrowserFaults(events: readonly BrowserFaultEvent[]): BrowserFaultSummary {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const sessionRequestFailures: string[] = [];
    const sessionResponseFailures: number[] = [];

    for (const event of events) {
        switch (event.kind) {
            case "console-error":
                consoleErrors.push(event.message);
                break;
            case "page-error":
                pageErrors.push(event.message);
                break;
            case "session-request-failed":
                sessionRequestFailures.push(event.errorText);
                break;
            case "session-response":
                if (event.status !== 200) sessionResponseFailures.push(event.status);
                break;
            default:
                assertNever(event);
        }
    }

    return { consoleErrors, pageErrors, sessionRequestFailures, sessionResponseFailures };
}

export function reconcileBrowserFaults(events: readonly BrowserFaultEvent[]): BrowserFaultSummary {
    const rawFaults = rawBrowserFaults(events);
    let pendingSessionAborts = 0;
    let recoveredSessionAborts = 0;

    for (const event of events) {
        switch (event.kind) {
            case "console-error":
            case "page-error":
                break;
            case "session-request-failed":
                if (event.errorText === SESSION_REQUEST_ABORTED) pendingSessionAborts += 1;
                break;
            case "session-response":
                if (event.status === 200 && pendingSessionAborts > 0) {
                    pendingSessionAborts -= 1;
                    recoveredSessionAborts += 1;
                }
                break;
            default:
                assertNever(event);
        }
    }

    const recoveryBudget = recoveredSessionAborts;
    let reconciledConsoleErrors = 0;
    let reconciledRequestFailures = 0;

    return {
        ...rawFaults,
        consoleErrors: rawFaults.consoleErrors.filter((message) => {
            if (reconciledConsoleErrors >= recoveryBudget || !isAuthSessionFetchError(message)) {
                return true;
            }
            reconciledConsoleErrors += 1;
            return false;
        }),
        sessionRequestFailures: rawFaults.sessionRequestFailures.filter((failure) => {
            if (
                reconciledRequestFailures >= recoveryBudget ||
                failure !== SESSION_REQUEST_ABORTED
            ) {
                return true;
            }
            reconciledRequestFailures += 1;
            return false;
        }),
    };
}

export async function settledBrowserFaults(log: BrowserFaultLog): Promise<BrowserFaultSummary> {
    await log.settle();
    return reconcileBrowserFaults(log.events);
}
