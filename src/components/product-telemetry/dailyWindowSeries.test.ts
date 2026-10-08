import { describe, expect, it } from "vitest";

import { dailyWindowSeries } from "./dailyWindowSeries";

describe("dailyWindowSeries", () => {
    it("covers every day of the half-open window and leaves unserved days null", () => {
        const series = dailyWindowSeries(
            [
                { day: "2026-10-01", activeAnonymousUsers: 2 },
                { day: "2026-10-02", activeAnonymousUsers: 1 },
            ],
            "2026-09-08",
            "2026-10-08",
        );

        expect(series).toHaveLength(30);
        expect(series[0]).toEqual({ day: "2026-09-08", value: null });
        expect(series.at(-1)).toEqual({ day: "2026-10-07", value: null });
        expect(series.filter((p) => p.value !== null)).toEqual([
            { day: "2026-10-01", value: 2 },
            { day: "2026-10-02", value: 1 },
        ]);
        expect(series.some((p) => p.value === 0)).toBe(false);
    });

    it("keeps a served zero as 0 and a served day outside the window", () => {
        const series = dailyWindowSeries(
            [
                { day: "2026-10-03", activeAnonymousUsers: 0 },
                { day: "2026-10-09", activeAnonymousUsers: 4 },
            ],
            "2026-10-01",
            "2026-10-05",
        );

        expect(series.find((p) => p.day === "2026-10-03")?.value).toBe(0);
        expect(series.find((p) => p.day === "2026-10-09")?.value).toBe(4);
    });

    it("returns the served rows when the window is not a valid day range", () => {
        expect(
            dailyWindowSeries(
                [{ day: "2026-10-01", activeAnonymousUsers: 2 }],
                "bad",
                "2026-10-08",
            ),
        ).toEqual([{ day: "2026-10-01", value: 2 }]);
    });
});
