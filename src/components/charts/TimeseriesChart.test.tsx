import { describe, expect, it } from "vitest";

import { orderTimeseriesPoints } from "./timeseriesData";

describe("orderTimeseriesPoints", () => {
    it("orders by the full ISO day, not the display label, across a year boundary", () => {
        // Deliberately out of order and spanning Dec→Jan; labels are compact "MM-DD".
        // Lexically "01-*" < "12-*", so sorting by the label would wrongly put January
        // first and corrupt the trend line (CHAOS-2079 regression).
        const input = [
            { day: "2027-01-02", value: 5, label: "01-02" },
            { day: "2026-12-30", value: 1, label: "12-30" },
            { day: "2027-01-01", value: 4, label: "01-01" },
            { day: "2026-12-31", value: 2, label: "12-31" },
        ];
        const { categories, values } = orderTimeseriesPoints(input);
        expect(categories).toEqual(["12-30", "12-31", "01-01", "01-02"]);
        expect(values).toEqual([1, 2, 4, 5]);
    });

    it("falls back to `day` for the label when none is provided (back-compat)", () => {
        const { categories } = orderTimeseriesPoints([
            { day: "2026-06-02", value: 1 },
            { day: "2026-06-01", value: 2 },
        ]);
        expect(categories).toEqual(["2026-06-01", "2026-06-02"]);
    });
});
