import { render, screen, within } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { OpportunityMasterDetail } from "./OpportunityMasterDetail";
import type { MetricFilter } from "@/lib/filters/types";

vi.mock("@/components/evidence/EvidencePanel", () => ({ EvidencePanel: () => null }));

const filters = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 30 },
    who: {},
    what: {},
    why: {},
    how: {},
} as MetricFilter;

const items = [
    {
        id: "opp-1",
        title: "Reduce Review Latency",
        rationale: "Review Latency climbed 1041% in the last 14 days.",
        evidence_links: ["/api/v1/explain?metric=review_latency"],
        suggested_experiments: ["Trial a review SLA"],
    },
    {
        id: "opp-2",
        title: "Reduce Cycle Time",
        rationale: "Cycle Time climbed 12% in the last 14 days.",
        evidence_links: [],
        suggested_experiments: ["Cap WIP"],
    },
];

describe("OpportunityMasterDetail", () => {
    it("lists every opportunity with its rationale sentence and selects the first", () => {
        render(<OpportunityMasterDetail items={items} filters={filters} />);

        const list = within(screen.getByTestId("opportunity-list"));
        expect(list.getByText("2 captured signals")).toBeInTheDocument();
        expect(list.getByText("Review Latency climbed 1041% in the last 14 days.")).toBeVisible();
        expect(list.getByRole("button", { name: /Reduce Review Latency/ })).toHaveAttribute(
            "aria-current",
            "true",
        );
        expect(
            within(screen.getByTestId("opportunity-detail")).getByRole("heading", {
                name: "Reduce Review Latency",
            }),
        ).toBeInTheDocument();
    });

    it("shows the clicked opportunity on the right", async () => {
        render(<OpportunityMasterDetail items={items} filters={filters} />);

        await userEvent.click(screen.getByRole("button", { name: /Reduce Cycle Time/ }));
        expect(
            within(screen.getByTestId("opportunity-detail")).getByRole("heading", {
                name: "Reduce Cycle Time",
            }),
        ).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Reduce Cycle Time/ })).toHaveAttribute(
            "aria-current",
            "true",
        );
        expect(screen.getByRole("button", { name: /Reduce Review Latency/ })).not.toHaveAttribute(
            "aria-current",
        );
    });
});
