import { beforeEach, describe, expect, it, vi } from "vitest";

import { postJson } from "@/lib/api/_shared";
import { getBlockedWorkIssues } from "@/lib/api/investment";
import type { MetricFilter } from "@/lib/filters/types";

vi.mock("@/lib/api/_shared", () => ({
    normalizeFilters: vi.fn((filters: MetricFilter) => filters),
    postJson: vi.fn(),
}));

const FILTERS: MetricFilter = {
    time: { range_days: 30, compare_days: 30 },
    scope: { level: "org", ids: [] },
    who: {},
    what: {},
    why: {},
    how: { wip_state: ["review"] },
};

describe("getBlockedWorkIssues", () => {
    beforeEach(() => {
        vi.mocked(postJson).mockReset();
    });

    it("posts the endpoint-only blocked selector without changing the shared filter", async () => {
        vi.mocked(postJson).mockResolvedValue({ items: [], count: 0 });

        await getBlockedWorkIssues(FILTERS);

        expect(postJson).toHaveBeenCalledWith(
            "/api/v1/drilldown/issues",
            {
                filters: {
                    ...FILTERS,
                    how: { wip_state: ["review"], blocked: true },
                },
                limit: 50,
            },
            30,
        );
        expect(FILTERS.how).toEqual({ wip_state: ["review"] });
    });
});
