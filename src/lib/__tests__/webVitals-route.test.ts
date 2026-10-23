import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/config", () => ({ publicEnv: { NEXT_PUBLIC_RUM_ENDPOINT: "on" } }));

import { onVital } from "../webVitals";

describe("web vitals beacon", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("sends the route pattern, never the raw pathname", async () => {
        const sendBeacon = vi.fn(() => true);
        vi.stubGlobal("navigator", { sendBeacon });
        vi.stubGlobal("window", { location: { pathname: "/org/admin/teams/id-84217-xyz" } });
        onVital({
            id: "v1",
            name: "LCP",
            value: 1,
            delta: 1,
            rating: "good",
            navigationType: "navigate",
        });
        expect(sendBeacon).toHaveBeenCalledTimes(1);
        const blob = (sendBeacon.mock.calls[0] as unknown as [string, Blob])[1];
        const body = JSON.parse(await blob.text()) as Record<string, unknown>;
        expect(body.url).toBe("/org/admin/teams/[id]");
        expect(JSON.stringify(body)).not.toContain("84217");
    });
});
