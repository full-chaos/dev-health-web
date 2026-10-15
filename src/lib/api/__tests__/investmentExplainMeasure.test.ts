import { beforeEach, describe, expect, it, vi } from "vitest";

const postJson = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("../_shared", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../_shared")>()),
    postJson,
}));

import { explainInvestmentMix } from "../investment";

describe("explainInvestmentMix (CHAOS-9809)", () => {
    beforeEach(() => postJson.mockClear());

    it("asks for the ISSUE_SIZE measure", async () => {
        await explainInvestmentMix({
            filters: {
                time: { range_days: 30, compare_days: 30 },
                scope: { level: "org", ids: ["acme"] },
                who: {},
                what: {},
                why: {},
                how: {},
            } as never,
        });
        expect(postJson).toHaveBeenCalledWith(
            "/api/v1/investment/explain",
            expect.objectContaining({ measure: "ISSUE_SIZE" }),
            0,
            expect.anything(),
        );
    });
});
