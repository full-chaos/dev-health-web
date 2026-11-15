import { describe, expect, it } from "vitest";

import { getLatestValue } from "../aggregateSeries";
import { SAMPLE_COVERAGE_DATA, SAMPLE_PIPELINES_DATA, SAMPLE_TESTS_DATA } from "../sample-data";

// W9: test mode shows the sample answer the way it shows a served one: every sample series is the
// scope's ORG series, so each sample tile has its value (the tiles read the ORG series only).
describe("TestOps sample data", () => {
    const all = [
        ...SAMPLE_PIPELINES_DATA.timeseries,
        ...SAMPLE_TESTS_DATA.timeseries,
        ...SAMPLE_COVERAGE_DATA.timeseries,
    ];

    it.each(all.map((series) => [series.measure, series] as const))(
        "%s is an ORG series with a value",
        (measure, series) => {
            expect(series.scope).toBe("ORG");
            expect(getLatestValue([series], measure)).toBeDefined();
        },
    );
});
