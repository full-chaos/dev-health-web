import { beforeEach, describe, expect, it, vi } from "vitest";

const postJson = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("../_shared", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../_shared")>()),
    postJson,
}));

import { explainInvestmentMix } from "../investment";

const filters = () =>
    ({
        time: { range_days: 30, compare_days: 30 },
        scope: { level: "org", ids: ["acme"] },
        who: {},
        what: {},
        why: {},
        how: {},
    }) as never;

describe("explainInvestmentMix window", () => {
    beforeEach(() => postJson.mockClear());

    it("sends the range the caller reads the mix over as date_range", async () => {
        await explainInvestmentMix({
            filters: filters(),
            dateRange: { startDate: "2026-09-18", endDate: "2026-10-18" },
        });
        expect(postJson).toHaveBeenCalledWith(
            "/api/v1/investment/explain",
            expect.objectContaining({
                date_range: { start_date: "2026-09-18", end_date: "2026-10-18" },
            }),
            0,
            expect.anything(),
        );
    });

    it("sends no date_range when the caller names none, so the server derives its own window", async () => {
        await explainInvestmentMix({ filters: filters() });
        const body = (postJson.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
        expect(body).not.toHaveProperty("date_range");
    });
});
