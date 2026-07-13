import { beforeEach, describe, expect, it, vi } from "vitest";

import { postJson } from "@/lib/api/_shared";
import { getHomeData } from "@/lib/api/home";
import type { MetricFilter } from "@/lib/filters/types";

vi.mock("@/lib/api/_shared", () => ({
    normalizeFilters: vi.fn((filters: MetricFilter) => filters),
    postJson: vi.fn(),
}));

const FILTERS: MetricFilter = {
    time: { range_days: 14, compare_days: 14 },
    scope: { level: "org", ids: [] },
    who: {},
    what: {},
    why: {},
    how: {},
};

describe("getHomeData", () => {
    beforeEach(() => {
        vi.mocked(postJson).mockReset();
    });

    it("disables web-layer revalidation so sync freshness stays current", async () => {
        vi.mocked(postJson).mockResolvedValue({});

        await getHomeData(FILTERS);

        expect(postJson).toHaveBeenCalledWith(
            "/api/v1/home",
            { filters: FILTERS },
            0,
            expect.any(Object),
        );
    });
});
