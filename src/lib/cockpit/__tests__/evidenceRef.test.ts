import { afterEach, describe, expect, it, vi } from "vitest";

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

    describe("the investment window", () => {
        afterEach(() => vi.useRealTimers());

        const at = (now: string) => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date(now));
        };
        const dated = (time: Record<string, unknown>) =>
            ({ ...filters, scope: { level: "org", ids: [] }, time }) as unknown as MetricFilter;

        it.each(["2026-10-19T00:30:00Z", "2026-10-19T23:30:00Z"])(
            "names N full UTC days that end yesterday for a relative range at %s",
            (now) => {
                at(now);
                const params = paramsOf(
                    buildThreadApiUrl(
                        "/api/v1/investment",
                        dated({ range_days: 30, compare_days: 30 }),
                        "align",
                    ),
                );

                expect(params.get("start_date")).toBe("2026-09-19");
                expect(params.get("end_date")).toBe("2026-10-18");
                expect(params.get("range_days")).toBe("30");
            },
        );

        it.each([
            ["today", "2026-10-19"],
            ["tomorrow", "2026-10-20"],
        ])("sends an explicit end of %s as yesterday", (_label, end) => {
            at("2026-10-19T12:00:00Z");
            const params = paramsOf(
                buildThreadApiUrl(
                    "/api/v1/investment",
                    dated({
                        range_days: 30,
                        compare_days: 30,
                        start_date: "2026-10-01",
                        end_date: end,
                    }),
                    "align",
                ),
            );

            expect(params.get("start_date")).toBe("2026-10-01");
            expect(params.get("end_date")).toBe("2026-10-18");
        });

        it("leaves the window of every other thread target as the filter names it", () => {
            at("2026-10-19T12:00:00Z");
            const future = dated({
                range_days: 30,
                compare_days: 30,
                start_date: "2026-10-01",
                end_date: "2026-10-20",
            });

            expect(
                paramsOf(buildThreadApiUrl("/api/v1/opportunities", future, "execute")).get(
                    "end_date",
                ),
            ).toBe("2026-10-20");
            expect(
                paramsOf(
                    buildThreadApiUrl(
                        "/api/v1/home",
                        dated({ range_days: 30, compare_days: 30 }),
                        "understand",
                    ),
                ).has("end_date"),
            ).toBe(false);
        });
    });
});
