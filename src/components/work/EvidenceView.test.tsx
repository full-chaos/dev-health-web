import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/utils";
import { EvidenceView } from "./EvidenceView";
import type { MetricFilter } from "@/lib/filters/types";

const filters: MetricFilter = {
    scope: { level: "repo", ids: ["repo-a"] },
    time: {
        range_days: 30,
        compare_days: 30,
        start_date: undefined,
        end_date: undefined,
    },
    who: {},
    what: {},
    why: {},
    how: {},
};

describe("EvidenceView", () => {
    it("renders one associations inspection action for the combined evidence view", () => {
        render(<EvidenceView filters={filters} wipExplain={null} blockedExplain={null} />);

        expect(screen.getAllByRole("link", { name: /inspect associations/i })).toHaveLength(1);
    });
});
