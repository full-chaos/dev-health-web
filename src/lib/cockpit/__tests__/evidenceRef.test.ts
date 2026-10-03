import { describe, expect, it } from "vitest";

import { buildThreadApiUrl } from "@/lib/cockpit/evidenceRef";
import type { MetricFilter } from "@/lib/filters/types";

const filters = {
    scope: { level: "team", ids: ["team-1", "team-2"] },
    time: { range_days: 90, compare_days: 90 },
    who: {},
    what: {},
    why: {},
    how: {},
} as MetricFilter;

const paramsOf = (url: string) => new URL(url, "http://local").searchParams;

describe("buildThreadApiUrl", () => {
    it("carries the scope, the window and the thread", () => {
        const url = buildThreadApiUrl("/api/v1/home", filters, "understand");

        expect(new URL(url, "http://local").pathname).toBe("/api/v1/home");
        expect(Object.fromEntries(paramsOf(url))).toEqual({
            scope_type: "team",
            range_days: "90",
            compare_days: "90",
            thread: "understand",
            scope_id: "team-1",
        });
    });

    it("leaves `thread` out for the page as a whole", () => {
        const params = paramsOf(buildThreadApiUrl("/api/v1/home", filters));

        expect(params.has("thread")).toBe(false);
        expect(params.get("scope_type")).toBe("team");
        expect(params.get("range_days")).toBe("90");
    });

    it("sends the explicit dates when the window has them", () => {
        const dated = {
            ...filters,
            scope: { level: "org", ids: [] },
            time: { ...filters.time, start_date: "2026-06-01", end_date: "2026-08-30" },
        } as MetricFilter;
        const params = paramsOf(buildThreadApiUrl("/api/v1/investment", dated, "align"));

        expect(params.get("start_date")).toBe("2026-06-01");
        expect(params.get("end_date")).toBe("2026-08-30");
        expect(params.has("scope_id")).toBe(false);
    });
});
