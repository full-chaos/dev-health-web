import { describe, expect, it } from "vitest";

import { NO_DATA_FOR_WINDOW, metricCardProps, metricDisplay } from "../metricDisplay";

const served = (flags: { has_data?: boolean; has_prior_data?: boolean }, over = {}) => ({
    value: 0,
    unit: "%",
    delta_pct: 0,
    ...flags,
    ...over,
});

describe("metricDisplay (CHAOS-9042)", () => {
    it.each([
        ["data + prior", { has_data: true, has_prior_data: true }, "measured", true],
        ["data, no prior", { has_data: true, has_prior_data: false }, "measured", false],
        ["no data + prior", { has_data: false, has_prior_data: true }, "no-data", false],
        ["no data, no prior", { has_data: false, has_prior_data: false }, "no-data", false],
        ["flags absent", {}, "measured", true],
    ] as const)("%s", (_name, flags, state, comparable) => {
        expect(metricDisplay(served(flags))).toMatchObject({ state, comparable });
    });

    it("a missing row is its own state, never a 0", () => {
        expect(metricDisplay(undefined)).toMatchObject({ state: "missing", comparable: false });
        expect(metricDisplay(null).state).toBe("missing");
        expect(metricCardProps(undefined)).toMatchObject({ valueText: "Not reported" });
        expect(metricCardProps(undefined).value).toBeUndefined();
    });

    it("carries the operating review tile rule for every flag combination", () => {
        // MetricTile.tsx: hasData = flag !== false; hasPriorData = flag !== false; comparable = both.
        for (const d of [undefined, true, false]) {
            for (const p of [undefined, true, false]) {
                const hasData = d !== false;
                const hasPriorData = p !== false;
                expect(metricDisplay({ has_data: d, has_prior_data: p })).toEqual({
                    state: hasData ? "measured" : "no-data",
                    hasData,
                    hasPriorData,
                    comparable: hasData && hasPriorData,
                });
            }
        }
    });

    it("card props: no data hides the value and the change; no prior hides only the change", () => {
        expect(metricCardProps(served({ has_data: false }))).toMatchObject({
            valueText: NO_DATA_FOR_WINDOW,
            hideTrend: true,
        });
        expect(metricCardProps(served({ has_data: false })).value).toBeUndefined();
        const noPrior = metricCardProps(served({ has_prior_data: false }, { value: 3 }));
        expect(noPrior).toMatchObject({ value: 3, unit: "%" });
        expect(noPrior.delta).toBeUndefined();
        expect(noPrior.valueText).toBeUndefined();
    });

    it("a measured 0 keeps its value and its change", () => {
        expect(metricCardProps(served({ has_data: true, has_prior_data: true }))).toMatchObject({
            value: 0,
            delta: 0,
        });
    });
});
