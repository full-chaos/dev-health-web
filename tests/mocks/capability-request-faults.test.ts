import type { Page, Request, Response } from "@playwright/test";
import { describe, expect, it } from "vitest";

import {
    recordCapabilityRequestFaults,
    unrecoveredBrowserRequestFailures,
    type BrowserRequestEvent,
} from "../helpers/capability-request-faults";

const ORIGIN = "http://127.0.0.1:3001";
const CAPABILITIES_URL = `${ORIGIN}/api/v1/dev/capabilities`;

const abortedCapabilitiesRequest = {
    kind: "failed",
    sequence: 1,
    url: CAPABILITIES_URL,
    method: "GET",
    errorText: "net::ERR_ABORTED",
} as const satisfies BrowserRequestEvent;

type RequestEvent = "request" | "requestfailed" | "requestfinished";

function deferred<T>() {
    let resolve: (value: T) => void;
    const promise = new Promise<T>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve: (value: T) => resolve(value) };
}

function request({
    url = CAPABILITIES_URL,
    method = "GET",
    headers = {},
    errorText = "net::ERR_ABORTED",
    response = Promise.resolve(null),
}: {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    errorText?: string;
    response?: Promise<{ status: () => number } | null>;
} = {}): Request {
    return {
        url: () => url,
        method: () => method,
        headers: () => headers,
        failure: () => ({ errorText }),
        response: () => response,
    } as unknown as Request;
}

function responseOf(
    forRequest: Request,
    {
        status = 200,
        contentType = "text/x-component",
    }: { status?: number; contentType?: string } = {},
): Response {
    return {
        request: () => forRequest,
        url: () => forRequest.url(),
        status: () => status,
        headers: () => ({ "content-type": contentType }),
    } as unknown as Response;
}

function requestEventPage() {
    const listeners = new Map<RequestEvent | "response", Array<(payload: never) => void>>();
    const page = {
        on: (event: RequestEvent | "response", listener: (payload: never) => void) => {
            listeners.set(event, [...(listeners.get(event) ?? []), listener]);
            return page;
        },
        url: () => `${ORIGIN}/superadmin/context-fabric/validation`,
    } as unknown as Page;
    return {
        page,
        emit(event: RequestEvent, requestEvent: Request): void {
            for (const listener of listeners.get(event) ?? []) listener(requestEvent as never);
        },
        respond(response: Response): void {
            for (const listener of listeners.get("response") ?? []) listener(response as never);
        },
    };
}

describe("capability request fault reconciliation", () => {
    it("waits for started capability requests and records their terminal fault or completed 200", async () => {
        const adapter = requestEventPage();
        const faults = recordCapabilityRequestFaults(adapter.page);
        const abortedRequest = request();

        adapter.emit("request", abortedRequest);
        let firstSettled = false;
        const firstSettle = faults.settle().then(() => {
            firstSettled = true;
        });
        await Promise.resolve();
        expect(firstSettled).toBe(false);

        adapter.emit("requestfailed", abortedRequest);
        await firstSettle;
        expect(faults.failedRequests()).toEqual([
            expect.objectContaining({ errorText: "net::ERR_ABORTED", url: CAPABILITIES_URL }),
        ]);

        const completedResponse = deferred<{ status: () => number } | null>();
        const replacementRequest = request({ response: completedResponse.promise });
        adapter.emit("request", replacementRequest);
        adapter.emit("requestfinished", replacementRequest);
        let secondSettled = false;
        const secondSettle = faults.settle().then(() => {
            secondSettled = true;
        });
        await Promise.resolve();
        expect(secondSettled).toBe(false);

        completedResponse.resolve({ status: () => 200 });
        await secondSettle;
        expect(faults.failedRequests()).toEqual([]);
    });

    it("allows an aborted capability request with a later completed 200 replacement", () => {
        const result = unrecoveredBrowserRequestFailures(
            [
                abortedCapabilitiesRequest,
                { kind: "finished", sequence: 2, url: CAPABILITIES_URL, status: 200 },
            ],
            `${ORIGIN}/superadmin/context-fabric/validation`,
        );

        expect(result).toEqual([]);
    });

    it("keeps an aborted capability request without a completed replacement", () => {
        const result = unrecoveredBrowserRequestFailures(
            [abortedCapabilitiesRequest],
            `${ORIGIN}/superadmin/context-fabric/validation`,
        );

        expect(result).toEqual([abortedCapabilitiesRequest]);
    });

    it("keeps an aborted capability request when its later replacement returns 500", () => {
        const result = unrecoveredBrowserRequestFailures(
            [
                abortedCapabilitiesRequest,
                { kind: "finished", sequence: 2, url: CAPABILITIES_URL, status: 500 },
            ],
            `${ORIGIN}/superadmin/context-fabric/validation`,
        );

        expect(result).toEqual([abortedCapabilitiesRequest]);
    });

    it("does not use a successful response recorded before the request abort as recovery", () => {
        const result = unrecoveredBrowserRequestFailures(
            [
                { kind: "finished", sequence: 1, url: CAPABILITIES_URL, status: 200 },
                { ...abortedCapabilitiesRequest, sequence: 2 },
            ],
            `${ORIGIN}/superadmin/context-fabric/validation`,
        );

        expect(result).toEqual([{ ...abortedCapabilitiesRequest, sequence: 2 }]);
    });

    it("keeps an aborted request to another URL even when a later request succeeds", () => {
        const failedOtherRequest = {
            kind: "failed",
            sequence: 1,
            url: `${ORIGIN}/api/v1/dev/other`,
            method: "GET",
            errorText: "net::ERR_ABORTED",
        } as const satisfies BrowserRequestEvent;
        const result = unrecoveredBrowserRequestFailures(
            [
                failedOtherRequest,
                { kind: "finished", sequence: 2, url: failedOtherRequest.url, status: 200 },
            ],
            `${ORIGIN}/superadmin/context-fabric/validation`,
        );

        expect(result).toEqual([failedOtherRequest]);
    });

    it("keeps an aborted request to the same path on another origin", () => {
        const otherOriginRequest = {
            kind: "failed",
            sequence: 1,
            url: "http://127.0.0.1:3002/api/v1/dev/capabilities",
            method: "GET",
            errorText: "net::ERR_ABORTED",
        } as const satisfies BrowserRequestEvent;
        const result = unrecoveredBrowserRequestFailures(
            [
                otherOriginRequest,
                { kind: "finished", sequence: 2, url: otherOriginRequest.url, status: 200 },
            ],
            `${ORIGIN}/superadmin/context-fabric/validation`,
        );

        expect(result).toEqual([otherOriginRequest]);
    });

    it("keeps an aborted request when the completed successor has a different URL", () => {
        const result = unrecoveredBrowserRequestFailures(
            [
                abortedCapabilitiesRequest,
                {
                    kind: "finished",
                    sequence: 2,
                    url: `${CAPABILITIES_URL}?refresh=true`,
                    status: 200,
                },
            ],
            `${ORIGIN}/superadmin/context-fabric/validation`,
        );

        expect(result).toEqual([abortedCapabilitiesRequest]);
    });

    it("keeps a later abort after an earlier aborted request recovered", () => {
        const laterAbort = { ...abortedCapabilitiesRequest, sequence: 3 };
        const result = unrecoveredBrowserRequestFailures(
            [
                abortedCapabilitiesRequest,
                { kind: "finished", sequence: 2, url: CAPABILITIES_URL, status: 200 },
                laterAbort,
            ],
            `${ORIGIN}/superadmin/context-fabric/validation`,
        );

        expect(result).toEqual([laterAbort]);
    });

    it("keeps a non-abort capability failure despite a later completed 200 replacement", () => {
        const networkFailure = {
            ...abortedCapabilitiesRequest,
            errorText: "net::ERR_CONNECTION_REFUSED",
        } as const satisfies BrowserRequestEvent;
        const result = unrecoveredBrowserRequestFailures(
            [networkFailure, { kind: "finished", sequence: 2, url: CAPABILITIES_URL, status: 200 }],
            `${ORIGIN}/superadmin/context-fabric/validation`,
        );

        expect(result).toEqual([networkFailure]);
    });

    it("keeps a non-GET capability abort despite a later completed 200 replacement", () => {
        const mutationFailure = { ...abortedCapabilitiesRequest, method: "POST" } as const;
        const result = unrecoveredBrowserRequestFailures(
            [
                mutationFailure,
                { kind: "finished", sequence: 2, url: CAPABILITIES_URL, status: 200 },
            ],
            `${ORIGIN}/superadmin/context-fabric/validation`,
        );

        expect(result).toEqual([mutationFailure]);
    });
});

describe("an aborted server action after its response", () => {
    const PAGE = `${ORIGIN}/superadmin/context-fabric/validation`;
    const responded = (
        overrides: Partial<Extract<BrowserRequestEvent, { kind: "responded" }>> = {},
    ) =>
        ({
            kind: "responded",
            sequence: 1,
            url: PAGE,
            status: 200,
            contentType: "text/x-component",
            ...overrides,
        }) as const satisfies BrowserRequestEvent;
    const aborted = (overrides: Partial<Extract<BrowserRequestEvent, { kind: "failed" }>> = {}) =>
        ({
            kind: "failed",
            sequence: 1,
            url: PAGE,
            method: "POST",
            errorText: "net::ERR_ABORTED",
            serverAction: true,
            ...overrides,
        }) as const satisfies BrowserRequestEvent;

    it("is not a fault when the 200 text/x-component response came first", () => {
        expect(unrecoveredBrowserRequestFailures([responded(), aborted()], PAGE)).toEqual([]);
    });

    it("accepts a content type with parameters, in any case", () => {
        const events = [responded({ contentType: "Text/X-Component; charset=utf-8" }), aborted()];
        expect(unrecoveredBrowserRequestFailures(events, PAGE)).toEqual([]);
    });

    it.each([
        ["no response was seen first", [aborted()]],
        ["the response came after the failure", [aborted(), responded()]],
        ["the response belongs to another request", [responded({ sequence: 2 }), aborted()]],
        ["the response was not 200", [responded({ status: 500 }), aborted()]],
        ["the response was 204", [responded({ status: 204 }), aborted()]],
        [
            "the content type is not text/x-component",
            [responded({ contentType: "text/html" }), aborted()],
        ],
        ["the content type is empty", [responded({ contentType: "" }), aborted()]],
        ["the request is a GET", [responded(), aborted({ method: "GET" })]],
        ["the request has no next-action header", [responded(), aborted({ serverAction: false })]],
        ["the serverAction flag is missing", [responded(), aborted({ serverAction: undefined })]],
        [
            "the failure is not an abort",
            [responded(), aborted({ errorText: "net::ERR_CONNECTION_RESET" })],
        ],
        [
            "the request went to another origin",
            [
                responded({ url: "http://127.0.0.1:3002/x" }),
                aborted({ url: "http://127.0.0.1:3002/x" }),
            ],
        ],
    ] as const)("stays a fault when %s", (_label, events) => {
        const failures = unrecoveredBrowserRequestFailures(events, PAGE);
        expect(failures).toHaveLength(1);
        expect(failures[0]?.kind).toBe("failed");
    });

    it("records a server action from the page events: response then abort is not a fault", () => {
        const adapter = requestEventPage();
        const faults = recordCapabilityRequestFaults(adapter.page);
        const action = request({ url: PAGE, method: "POST", headers: { "next-action": "40abc" } });

        adapter.emit("request", action);
        adapter.respond(responseOf(action));
        adapter.emit("requestfailed", action);

        expect(faults.failedRequests()).toEqual([]);
    });

    it("records a server action from the page events: abort before any response is a fault", () => {
        const adapter = requestEventPage();
        const faults = recordCapabilityRequestFaults(adapter.page);
        const action = request({ url: PAGE, method: "POST", headers: { "next-action": "40abc" } });

        adapter.emit("request", action);
        adapter.emit("requestfailed", action);
        adapter.respond(responseOf(action));

        expect(faults.failedRequests()).toEqual([
            expect.objectContaining({ method: "POST", url: PAGE, serverAction: true }),
        ]);
    });
});

describe("an aborted RSC refresh GET after its response", () => {
    const PAGE = `${ORIGIN}/org/admin/integrations/pagerduty`;
    const RSC_URL = `${PAGE}?_rsc=abc12`;
    const responded = (
        overrides: Partial<Extract<BrowserRequestEvent, { kind: "responded" }>> = {},
    ) =>
        ({
            kind: "responded",
            sequence: 1,
            url: RSC_URL,
            status: 200,
            contentType: "text/x-component",
            ...overrides,
        }) as const satisfies BrowserRequestEvent;
    const aborted = (overrides: Partial<Extract<BrowserRequestEvent, { kind: "failed" }>> = {}) =>
        ({
            kind: "failed",
            sequence: 1,
            url: RSC_URL,
            method: "GET",
            errorText: "net::ERR_ABORTED",
            ...overrides,
        }) as const satisfies BrowserRequestEvent;

    it("is not a fault when the 200 text/x-component response came first", () => {
        expect(unrecoveredBrowserRequestFailures([responded(), aborted()], PAGE)).toEqual([]);
    });

    it.each([
        ["no response was seen first", [aborted()]],
        ["the response came after the failure", [aborted(), responded()]],
        ["the response belongs to another request", [responded({ sequence: 2 }), aborted()]],
        ["the response was not 200", [responded({ status: 500 }), aborted()]],
        [
            "the content type is not text/x-component",
            [responded({ contentType: "text/html" }), aborted()],
        ],
        ["the request is a POST", [responded(), aborted({ method: "POST" })]],
        [
            "the failure is not an abort",
            [responded(), aborted({ errorText: "net::ERR_CONNECTION_RESET" })],
        ],
        [
            "the request went to another origin",
            [
                responded({ url: "http://127.0.0.1:3002/x?_rsc=abc12" }),
                aborted({ url: "http://127.0.0.1:3002/x?_rsc=abc12" }),
            ],
        ],
        ["the url has no _rsc query key", [responded({ url: PAGE }), aborted({ url: PAGE })]],
    ] as const)("stays a fault when %s", (_label, events) => {
        const failures = unrecoveredBrowserRequestFailures(events, PAGE);
        expect(failures).toHaveLength(1);
        expect(failures[0]?.kind).toBe("failed");
    });
});
