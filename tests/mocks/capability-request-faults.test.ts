import type { Page, Request } from "@playwright/test";
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
    errorText = "net::ERR_ABORTED",
    response = Promise.resolve(null),
}: {
    url?: string;
    errorText?: string;
    response?: Promise<{ status: () => number } | null>;
} = {}): Request {
    return {
        url: () => url,
        failure: () => ({ errorText }),
        response: () => response,
    } as unknown as Request;
}

function requestEventPage() {
    const listeners = new Map<RequestEvent, Array<(request: Request) => void>>();
    const page = {
        on: (event: RequestEvent, listener: (request: Request) => void) => {
            listeners.set(event, [...(listeners.get(event) ?? []), listener]);
            return page;
        },
        url: () => `${ORIGIN}/superadmin/context-fabric/validation`,
    } as unknown as Page;
    return {
        page,
        emit(event: RequestEvent, requestEvent: Request): void {
            for (const listener of listeners.get(event) ?? []) listener(requestEvent);
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
});
