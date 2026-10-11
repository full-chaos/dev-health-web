import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TelemetryProvider } from "./TelemetryProvider";

let pathname = "/metrics?tab=dora";

const telemetryMock = vi.hoisted(() => ({
    setTelemetryContext: vi.fn(),
    trackTelemetryEvent: vi.fn(),
    flushTelemetryEventsOnHide: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    usePathname: () => pathname,
}));

vi.mock("@/lib/telemetry", () => telemetryMock);

describe("TelemetryProvider", () => {
    beforeEach(() => {
        pathname = "/metrics?tab=dora";
        telemetryMock.setTelemetryContext.mockClear();
        telemetryMock.trackTelemetryEvent.mockClear();
        telemetryMock.flushTelemetryEventsOnHide.mockClear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("emits session_started and page_viewed with hashed identity on mount", async () => {
        render(
            <TelemetryProvider orgId="org-raw" userId="user-raw">
                <div>App</div>
            </TelemetryProvider>,
        );

        await waitFor(() =>
            expect(telemetryMock.trackTelemetryEvent).toHaveBeenCalledWith("session_started", {
                entryRoutePattern: "/metrics",
            }),
        );
        await waitFor(() =>
            expect(telemetryMock.trackTelemetryEvent).toHaveBeenCalledWith("page_viewed", {
                routePattern: "/metrics",
                page: "/metrics",
                referrerRoutePattern: null,
            }),
        );
        await waitFor(() =>
            expect(telemetryMock.setTelemetryContext).toHaveBeenCalledWith(
                expect.objectContaining({
                    anonymousUserId: expect.not.stringContaining("user-raw"),
                    orgIdHash: expect.not.stringContaining("org-raw"),
                }),
            ),
        );
    });

    it("emits another sanitized page_viewed when the pathname changes", async () => {
        const { rerender } = render(
            <TelemetryProvider orgId="org-raw" userId="user-raw">
                <div>App</div>
            </TelemetryProvider>,
        );
        await waitFor(() =>
            expect(telemetryMock.trackTelemetryEvent).toHaveBeenCalledWith(
                "session_started",
                expect.any(Object),
            ),
        );

        pathname = "/people/abc-123/metrics/cycle-time?person=Ada#top";
        rerender(
            <TelemetryProvider orgId="org-raw" userId="user-raw">
                <div>App</div>
            </TelemetryProvider>,
        );

        await waitFor(() =>
            expect(telemetryMock.trackTelemetryEvent).toHaveBeenCalledWith("page_viewed", {
                routePattern: "/people/[person_id]/metrics/[metric]",
                page: "/people/[person_id]/metrics/[metric]",
                referrerRoutePattern: "/metrics",
            }),
        );
    });

    it("emits session_ended on pagehide", async () => {
        vi.spyOn(performance, "now").mockReturnValueOnce(1_000).mockReturnValueOnce(2_500);
        render(
            <TelemetryProvider orgId="org-raw" userId="user-raw">
                <button type="button">App</button>
            </TelemetryProvider>,
        );
        await waitFor(() =>
            expect(telemetryMock.trackTelemetryEvent).toHaveBeenCalledWith(
                "session_started",
                expect.any(Object),
            ),
        );

        act(() => {
            window.dispatchEvent(new Event("devhealth:telemetry-interaction"));
            window.dispatchEvent(new Event("pagehide"));
        });

        expect(telemetryMock.trackTelemetryEvent).toHaveBeenCalledWith("session_ended", {
            durationMs: expect.any(Number),
            pagesViewed: 1,
            interactions: 1,
        });
    });

    it("flushes the queue after session_ended on pagehide and when the page turns hidden", async () => {
        render(
            <TelemetryProvider>
                <div>App</div>
            </TelemetryProvider>,
        );
        await waitFor(() =>
            expect(telemetryMock.trackTelemetryEvent).toHaveBeenCalledWith(
                "session_started",
                expect.any(Object),
            ),
        );
        act(() => {
            window.dispatchEvent(new Event("pagehide"));
        });
        expect(telemetryMock.flushTelemetryEventsOnHide).toHaveBeenCalledTimes(1);
        const order = (fn: { mock: { invocationCallOrder: number[] } }) =>
            fn.mock.invocationCallOrder.at(-1) ?? 0;
        expect(order(telemetryMock.flushTelemetryEventsOnHide)).toBeGreaterThan(
            order(telemetryMock.trackTelemetryEvent),
        );

        vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
        act(() => {
            document.dispatchEvent(new Event("visibilitychange"));
        });
        expect(telemetryMock.flushTelemetryEventsOnHide).toHaveBeenCalledTimes(2);
    });

    it("does not flush when the page becomes visible", async () => {
        render(
            <TelemetryProvider>
                <div>App</div>
            </TelemetryProvider>,
        );
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
        act(() => {
            document.dispatchEvent(new Event("visibilitychange"));
        });
        expect(telemetryMock.flushTelemetryEventsOnHide).not.toHaveBeenCalled();
    });

    it("sets the hashed identity before the first event of the page life", async () => {
        render(
            <TelemetryProvider orgId="org-raw" userId="user-raw">
                <div>App</div>
            </TelemetryProvider>,
        );
        await waitFor(() =>
            expect(telemetryMock.trackTelemetryEvent).toHaveBeenCalledWith(
                "session_started",
                expect.any(Object),
            ),
        );
        const identityCall = telemetryMock.setTelemetryContext.mock.calls.findIndex(
            ([ctx]) => ctx && "anonymousUserId" in ctx && "orgIdHash" in ctx,
        );
        expect(identityCall).toBeGreaterThanOrEqual(0);
        const identityOrder =
            telemetryMock.setTelemetryContext.mock.invocationCallOrder[identityCall];
        for (const order of telemetryMock.trackTelemetryEvent.mock.invocationCallOrder) {
            expect(order).toBeGreaterThan(identityOrder);
        }
    });

    describe("session_ended once per visible period", () => {
        const endedCalls = () =>
            telemetryMock.trackTelemetryEvent.mock.calls.filter(
                ([name]) => name === "session_ended",
            );
        const setVisibility = (state: "hidden" | "visible") => {
            vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
            act(() => {
                document.dispatchEvent(new Event("visibilitychange"));
            });
        };
        const mountReady = async () => {
            render(
                <TelemetryProvider>
                    <div>App</div>
                </TelemetryProvider>,
            );
            await waitFor(() =>
                expect(telemetryMock.trackTelemetryEvent).toHaveBeenCalledWith(
                    "session_started",
                    expect.any(Object),
                ),
            );
        };

        it("hidden then pagehide emits one event and still flushes on pagehide", async () => {
            await mountReady();
            setVisibility("hidden");
            act(() => {
                window.dispatchEvent(new Event("pagehide"));
            });
            expect(endedCalls()).toHaveLength(1);
            expect(telemetryMock.flushTelemetryEventsOnHide).toHaveBeenCalledTimes(2);
        });

        it("hidden, visible, hidden emits one event per visible period", async () => {
            await mountReady();
            setVisibility("hidden");
            setVisibility("hidden");
            expect(endedCalls()).toHaveLength(1);
            setVisibility("visible");
            setVisibility("hidden");
            expect(endedCalls()).toHaveLength(2);
        });

        it("bfcache restore re-arms the event for the next hide", async () => {
            await mountReady();
            act(() => {
                window.dispatchEvent(new Event("pagehide"));
            });
            expect(endedCalls()).toHaveLength(1);
            act(() => {
                window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
            });
            act(() => {
                window.dispatchEvent(new Event("pagehide"));
            });
            expect(endedCalls()).toHaveLength(2);
        });

        it("a plain tab close (pagehide only) loses no event", async () => {
            await mountReady();
            act(() => {
                window.dispatchEvent(new Event("pagehide"));
            });
            expect(endedCalls()).toHaveLength(1);
        });
    });

    it("emits feature_viewed once per route view and not on re-render", async () => {
        const { rerender } = render(
            <TelemetryProvider>
                <div>App</div>
            </TelemetryProvider>,
        );
        const featureCalls = () =>
            telemetryMock.trackTelemetryEvent.mock.calls.filter((c) => c[0] === "feature_viewed");
        await waitFor(() => expect(featureCalls()).toHaveLength(1));
        rerender(
            <TelemetryProvider>
                <div>App2</div>
            </TelemetryProvider>,
        );
        expect(featureCalls()).toHaveLength(1);
        expect(featureCalls()[0][1]).toEqual({
            feature: "metrics",
            surface: "route",
            routePattern: "/metrics",
        });
    });

    it("emits client_error from window handlers", async () => {
        render(
            <TelemetryProvider>
                <div>App</div>
            </TelemetryProvider>,
        );
        act(() => {
            window.dispatchEvent(new ErrorEvent("error", { error: new RangeError("x") }));
        });
        expect(telemetryMock.trackTelemetryEvent).toHaveBeenCalledWith(
            "client_error",
            expect.objectContaining({ boundary: "global", errorClass: "RangeError" }),
        );
    });
});
