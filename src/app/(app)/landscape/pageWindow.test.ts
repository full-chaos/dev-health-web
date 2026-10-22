import { afterEach, describe, expect, it, vi } from "vitest";

const graphqlFetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ requireSession: async () => ({ user: { org_id: "org-1" } }) }));
vi.mock("@/lib/graphql/server", () => ({ graphqlFetch }));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: async () => ({ ok: false }) }));
vi.mock("@/lib/api/visuals", () => ({ getQuadrant: async () => null }));
vi.mock("@/lib/api/code", () => ({ getBusFactorData: async () => null }));

import { defaultMetricFilter } from "@/lib/filters/defaults";
import { encodeFilterParam } from "@/lib/filters/encode";
import type { MetricFilter } from "@/lib/filters/types";
import LandscapePage from "./page";

async function hotspotsInput(time: Partial<MetricFilter["time"]>) {
    graphqlFetch.mockReset();
    graphqlFetch.mockResolvedValue({ hotspots: { rows: [] } });
    await LandscapePage({
        searchParams: Promise.resolve({
            f: encodeFilterParam({
                ...defaultMetricFilter,
                time: { ...defaultMetricFilter.time, ...time },
            }),
        }),
    });
    expect(graphqlFetch).toHaveBeenCalledTimes(1);
    return graphqlFetch.mock.calls[0][1].input as { sinceUtc: string; untilUtc: string };
}

describe("Landscape hotspots window", () => {
    afterEach(() => vi.useRealTimers());

    it.each(["2026-10-19T00:30:00Z", "2026-10-19T23:30:00Z"])(
        "is the shared window: N full UTC days ending yesterday, at %s",
        async (now) => {
            vi.useFakeTimers({ toFake: ["Date"] });
            vi.setSystemTime(new Date(now));
            const input = await hotspotsInput({ range_days: 7 });
            expect(input.sinceUtc).toBe("2026-10-12T00:00:00Z");
            expect(input.untilUtc).toBe("2026-10-18T23:59:59Z");
        },
    );

    it("honours an explicit window and clamps an end after yesterday", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
        const input = await hotspotsInput({
            start_date: "2026-10-01",
            end_date: "2026-10-30",
        });
        expect(input.sinceUtc).toBe("2026-10-01T00:00:00Z");
        expect(input.untilUtc).toBe("2026-10-18T23:59:59Z");
    });

    it("takes the date part of an explicit bound that carries a time part", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
        const input = await hotspotsInput({
            start_date: "2026-10-01T12:00:00Z",
            end_date: "2026-10-02T18:00:00Z",
        });
        expect(input.sinceUtc).toBe("2026-10-01T00:00:00Z");
        expect(input.untilUtc).toBe("2026-10-02T23:59:59Z");
    });
});
