import type { Page, Request } from "@playwright/test";

const CAPABILITIES_PATH = "/api/v1/dev/capabilities";
const REQUEST_ABORTED = "net::ERR_ABORTED";
const RSC_QUERY_KEY = "_rsc";
const SERVER_ACTION_HEADER = "next-action";
const SERVER_ACTION_CONTENT_TYPE = "text/x-component";

export type BrowserRequestEvent =
    | {
          readonly kind: "failed";
          readonly sequence: number;
          readonly url: string;
          readonly method: string;
          readonly errorText: string;
          readonly serverAction?: boolean;
      }
    | {
          readonly kind: "finished";
          readonly sequence: number;
          readonly url: string;
          readonly status: number | null;
      }
    | {
          readonly kind: "responded";
          readonly sequence: number;
          readonly url: string;
          readonly status: number;
          readonly contentType: string;
      };

export type BrowserRequestFailure = Extract<BrowserRequestEvent, { kind: "failed" }>;

export type CapabilityRequestFaultLog = {
    readonly failedRequests: () => readonly BrowserRequestFailure[];
    readonly settle: () => Promise<void>;
};

function requestOrigin(url: string): string | null {
    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
}

function isRecoveredCapabilityAbort(
    failure: BrowserRequestFailure,
    events: readonly BrowserRequestEvent[],
    pageOrigin: string | null,
): boolean {
    if (failure.errorText !== REQUEST_ABORTED || failure.method !== "GET" || pageOrigin === null) {
        return false;
    }

    const requestUrl = new URL(failure.url);
    if (requestUrl.origin !== pageOrigin || requestUrl.pathname !== CAPABILITIES_PATH) return false;

    return events.some(
        (event) =>
            event.kind === "finished" &&
            event.sequence > failure.sequence &&
            event.url === failure.url &&
            event.status === 200,
    );
}

// The Next client cancels the end of a server action's text/x-component stream once the action result
// is decoded: Chromium reports that as net::ERR_ABORTED after a 200 response (dev and prod builds, the
// result resolves before the cancel; CHAOS-11098). An abort before any response stays a failure.
function isCancelledAfterServerActionResponse(
    failure: BrowserRequestFailure,
    events: readonly BrowserRequestEvent[],
    pageOrigin: string | null,
): boolean {
    if (
        failure.errorText !== REQUEST_ABORTED ||
        failure.method !== "POST" ||
        failure.serverAction !== true ||
        pageOrigin === null ||
        requestOrigin(failure.url) !== pageOrigin
    ) {
        return false;
    }

    const failedAt = events.indexOf(failure);
    return events.some(
        (event, index) =>
            index < failedAt &&
            event.kind === "responded" &&
            event.sequence === failure.sequence &&
            event.status === 200 &&
            event.contentType.toLowerCase().startsWith(SERVER_ACTION_CONTENT_TYPE),
    );
}

// router.refresh() fetches an RSC payload (GET with an `_rsc` query key); the Next client can cancel the
// stream after the 200 response, which Chromium reports as net::ERR_ABORTED. An abort before any
// response, a non-200 response or any other error stays a failure.
function isCancelledAfterRscResponse(
    failure: BrowserRequestFailure,
    events: readonly BrowserRequestEvent[],
    pageOrigin: string | null,
): boolean {
    if (
        failure.errorText !== REQUEST_ABORTED ||
        failure.method !== "GET" ||
        pageOrigin === null ||
        requestOrigin(failure.url) !== pageOrigin ||
        !new URL(failure.url).searchParams.has(RSC_QUERY_KEY)
    ) {
        return false;
    }

    const failedAt = events.indexOf(failure);
    return events.some(
        (event, index) =>
            index < failedAt &&
            event.kind === "responded" &&
            event.sequence === failure.sequence &&
            event.status === 200 &&
            event.contentType.toLowerCase().startsWith(SERVER_ACTION_CONTENT_TYPE),
    );
}

export function unrecoveredBrowserRequestFailures(
    events: readonly BrowserRequestEvent[],
    pageUrl: string,
): readonly BrowserRequestFailure[] {
    const pageOrigin = requestOrigin(pageUrl);
    return events.filter(
        (event): event is BrowserRequestFailure =>
            event.kind === "failed" &&
            !isRecoveredCapabilityAbort(event, events, pageOrigin) &&
            !isCancelledAfterServerActionResponse(event, events, pageOrigin) &&
            !isCancelledAfterRscResponse(event, events, pageOrigin),
    );
}

// Next 16.3 development can expose an aborted capability fetch during provider cleanup.
// Keep every failure unless the same request is later replaced by a completed 200 response.
export function recordCapabilityRequestFaults(page: Page): CapabilityRequestFaultLog {
    const events: BrowserRequestEvent[] = [];
    const sequences = new WeakMap<Request, number>();
    const pendingCapabilityRequests = new Set<Request>();
    const settlementWaiters = new Set<() => void>();
    let nextSequence = 0;

    const sequenceFor = (request: Request): number => {
        const existing = sequences.get(request);
        if (existing !== undefined) return existing;
        const sequence = ++nextSequence;
        sequences.set(request, sequence);
        return sequence;
    };

    const isCapabilityRequest = (request: Request): boolean => {
        try {
            return new URL(request.url()).pathname === CAPABILITIES_PATH;
        } catch {
            return false;
        }
    };

    const markCapabilityRequestSettled = (request: Request): void => {
        if (!pendingCapabilityRequests.delete(request) || pendingCapabilityRequests.size > 0)
            return;
        for (const resolve of settlementWaiters) resolve();
        settlementWaiters.clear();
    };

    const waitForPendingCapabilityRequests = (): Promise<void> => {
        if (pendingCapabilityRequests.size === 0) return Promise.resolve();
        return new Promise((resolve) => settlementWaiters.add(resolve));
    };

    page.on("request", (request) => {
        sequenceFor(request);
        if (isCapabilityRequest(request)) pendingCapabilityRequests.add(request);
    });
    page.on("requestfailed", (request) => {
        events.push({
            kind: "failed",
            sequence: sequenceFor(request),
            url: request.url(),
            method: request.method(),
            errorText: request.failure()?.errorText ?? "",
            serverAction: SERVER_ACTION_HEADER in request.headers(),
        });
        markCapabilityRequestSettled(request);
    });
    page.on("response", (response) => {
        events.push({
            kind: "responded",
            sequence: sequenceFor(response.request()),
            url: response.url(),
            status: response.status(),
            contentType: response.headers()["content-type"] ?? "",
        });
    });
    page.on("requestfinished", (request) => {
        void request
            .response()
            .then((response) => {
                events.push({
                    kind: "finished",
                    sequence: sequenceFor(request),
                    url: request.url(),
                    status: response?.status() ?? null,
                });
            })
            .catch(() => {
                events.push({
                    kind: "finished",
                    sequence: sequenceFor(request),
                    url: request.url(),
                    status: null,
                });
            })
            .finally(() => markCapabilityRequestSettled(request));
    });

    return {
        failedRequests: () => unrecoveredBrowserRequestFailures(events, page.url()),
        settle: async () => {
            await waitForPendingCapabilityRequests();
        },
    };
}
