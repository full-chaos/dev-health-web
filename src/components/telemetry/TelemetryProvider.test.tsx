import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TelemetryProvider } from "./TelemetryProvider";

let pathname = "/metrics?tab=dora";

const telemetryMock = vi.hoisted(() => ({
  setTelemetryContext: vi.fn(),
  trackTelemetryEvent: vi.fn(),
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
});
