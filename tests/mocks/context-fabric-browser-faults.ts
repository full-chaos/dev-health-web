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

export function recordBrowserFaults(page: Page): BrowserFaultLog {
    const events: BrowserFaultEvent[] = [];
    const pendingSessionRequests = new Set<Request>();
    const settlementWaiters = new Set<() => void>();
    const markSessionRequestSettled = (request: Request): void => {
        if (!pendingSessionRequests.delete(request) || pendingSessionRequests.size > 0) return;
        for (const resolve of settlementWaiters) resolve();
        settlementWaiters.clear();
    };
    const waitForPendingSessionRequests = (): Promise<void> => {
        if (pendingSessionRequests.size === 0) return Promise.resolve();
        return new Promise((resolve) => settlementWaiters.add(resolve));
    };

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
            pendingSessionRequests.add(request);
        }
    });
    page.on("requestfailed", (request) => {
        if (isSessionRequest(request.url(), request.method())) {
            events.push({
                kind: "session-request-failed",
                errorText: request.failure()?.errorText ?? "",
            });
            markSessionRequestSettled(request);
        }
    });
    page.on("requestfinished", (request) => {
        if (isSessionRequest(request.url(), request.method())) {
            markSessionRequestSettled(request);
        }
    });
    page.on("response", (response) => {
        if (isSessionRequest(response.url(), response.request().method())) {
            const pendingRequests = [...pendingSessionRequests];
            const responseIndex = pendingRequests.indexOf(response.request());
            for (const request of pendingRequests.slice(0, Math.max(responseIndex, 0))) {
                events.push({
                    kind: "session-request-failed",
                    errorText: SESSION_REQUEST_ABORTED,
                });
                markSessionRequestSettled(request);
            }
            events.push({ kind: "session-response", status: response.status() });
            markSessionRequestSettled(response.request());
        }
    });
    return {
        events,
        settle: async () => {
            await waitForPendingSessionRequests();
            await page.evaluate(
                () =>
                    new Promise<void>((resolve) => {
                        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
                    }),
            );
            await waitForPendingSessionRequests();
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
