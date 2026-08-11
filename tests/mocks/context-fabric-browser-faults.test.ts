import { describe, expect, it } from "vitest";
import {
    EMPTY_BROWSER_FAULTS,
    createSessionRequestTracker,
    reconcileBrowserFaults,
    settledBrowserFaults,
    type BrowserFaultEvent,
    type BrowserFaultLog,
} from "./context-fabric-browser-faults";

const AUTH_SESSION_FETCH_ERROR = [
    "o: Failed to fetch. Read more at https://errors.authjs.dev#autherror",
    "    at async u._getSession (http://127.0.0.1:3012/_next/static/chunks/auth.js:3:1656)",
].join("\n");

const ABORTED_SESSION_REQUEST = {
    kind: "session-request-failed",
    errorText: "net::ERR_ABORTED",
} as const satisfies BrowserFaultEvent;
const SUCCESSFUL_SESSION_RESPONSE = {
    kind: "session-response",
    status: 200,
} as const satisfies BrowserFaultEvent;
const AUTH_SESSION_CONSOLE_ERROR = {
    kind: "console-error",
    message: AUTH_SESSION_FETCH_ERROR,
} as const satisfies BrowserFaultEvent;

describe("Context Fabric browser fault reconciliation", () => {
    it("settles a prior-document session request when navigation has no lifecycle event", async () => {
        const events: BrowserFaultEvent[] = [];
        const tracker = createSessionRequestTracker<object>(events);
        const abandonedRequest = {};
        const recoveredRequest = {};
        tracker.started(abandonedRequest);

        let settled = false;
        const pending = tracker.waitForPending().then(() => {
            settled = true;
        });
        await Promise.resolve();
        expect(settled).toBe(false);

        tracker.mainFrameNavigated();
        await pending;
        tracker.started(recoveredRequest);
        tracker.responded(recoveredRequest, 200);
        tracker.finished(recoveredRequest);

        expect(reconcileBrowserFaults(events)).toEqual(EMPTY_BROWSER_FAULTS);

        // A lifecycle event arriving late for the abandoned document must not
        // duplicate the abort or let that same request recover itself.
        tracker.responded(abandonedRequest, 200);
        tracker.failed(abandonedRequest, "net::ERR_ABORTED");
        expect(events).toEqual([ABORTED_SESSION_REQUEST, SUCCESSFUL_SESSION_RESPONSE]);
    });

    it.each([
        [
            "console-first",
            [AUTH_SESSION_CONSOLE_ERROR, ABORTED_SESSION_REQUEST, SUCCESSFUL_SESSION_RESPONSE],
        ],
        [
            "network-first",
            [ABORTED_SESSION_REQUEST, SUCCESSFUL_SESSION_RESPONSE, AUTH_SESSION_CONSOLE_ERROR],
        ],
    ])(
        "reconciles a navigation-aborted Auth.js session refresh when recovery events arrive %s",
        (_order, events) => {
            const result = reconcileBrowserFaults(events);

            expect(result).toEqual(EMPTY_BROWSER_FAULTS);
        },
    );

    it("keeps an Auth.js session fetch error without a matching request abort", () => {
        const result = reconcileBrowserFaults([
            AUTH_SESSION_CONSOLE_ERROR,
            SUCCESSFUL_SESSION_RESPONSE,
        ]);

        expect(result.consoleErrors).toEqual([AUTH_SESSION_FETCH_ERROR]);
    });

    it("keeps an aborted session request without a successful recovery response", () => {
        const result = reconcileBrowserFaults([
            AUTH_SESSION_CONSOLE_ERROR,
            ABORTED_SESSION_REQUEST,
        ]);

        expect(result.consoleErrors).toEqual([AUTH_SESSION_FETCH_ERROR]);
        expect(result.sessionRequestFailures).toEqual(["net::ERR_ABORTED"]);
    });

    it("keeps non-abort session request failures", () => {
        const result = reconcileBrowserFaults([
            { kind: "session-request-failed", errorText: "net::ERR_CONNECTION_REFUSED" },
            SUCCESSFUL_SESSION_RESPONSE,
        ]);

        expect(result.sessionRequestFailures).toEqual(["net::ERR_CONNECTION_REFUSED"]);
    });

    it("keeps non-successful session responses", () => {
        const result = reconcileBrowserFaults([{ kind: "session-response", status: 500 }]);

        expect(result.sessionResponseFailures).toEqual([500]);
    });

    it("keeps unrelated console errors beside a recovered Auth.js session abort", () => {
        const unrelatedError = "Hydration failed";
        const result = reconcileBrowserFaults([
            AUTH_SESSION_CONSOLE_ERROR,
            { kind: "console-error", message: unrelatedError },
            ABORTED_SESSION_REQUEST,
            SUCCESSFUL_SESSION_RESPONSE,
        ]);

        expect(result.consoleErrors).toEqual([unrelatedError]);
    });

    it("keeps excess Auth.js errors when only one session abort recovered", () => {
        const result = reconcileBrowserFaults([
            AUTH_SESSION_CONSOLE_ERROR,
            AUTH_SESSION_CONSOLE_ERROR,
            ABORTED_SESSION_REQUEST,
            SUCCESSFUL_SESSION_RESPONSE,
        ]);

        expect(result.consoleErrors).toEqual([AUTH_SESSION_FETCH_ERROR]);
    });

    it("does not use a session response recorded before the request abort as recovery", () => {
        const result = reconcileBrowserFaults([
            SUCCESSFUL_SESSION_RESPONSE,
            ABORTED_SESSION_REQUEST,
            AUTH_SESSION_CONSOLE_ERROR,
        ]);

        expect(result.consoleErrors).toEqual([AUTH_SESSION_FETCH_ERROR]);
        expect(result.sessionRequestFailures).toEqual(["net::ERR_ABORTED"]);
    });

    it("settles late browser events before declaring a recovered session abort healthy", async () => {
        const events: BrowserFaultEvent[] = [
            ABORTED_SESSION_REQUEST,
            SUCCESSFUL_SESSION_RESPONSE,
            AUTH_SESSION_CONSOLE_ERROR,
        ];
        const log: BrowserFaultLog = {
            events,
            settle: () => {
                events.push(AUTH_SESSION_CONSOLE_ERROR);
                return Promise.resolve();
            },
        };

        const result = await settledBrowserFaults(log);

        expect(result.consoleErrors).toEqual([AUTH_SESSION_FETCH_ERROR]);
    });
});
