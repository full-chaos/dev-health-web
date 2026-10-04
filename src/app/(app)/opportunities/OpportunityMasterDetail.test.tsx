import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, within } from "@/test/utils";
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
        change_percent: 1041.4,
        direction: "up" as const,
        range_days: 14,
        compare_days: 14,
    },
    {
        id: "opp-2",
        title: "Reduce Cycle Time",
        rationale: "Cycle Time climbed 12% in the last 14 days.",
        evidence_links: [],
        suggested_experiments: ["Cap WIP"],
        change_percent: 12.2,
        direction: "up" as const,
        range_days: 14,
        compare_days: 14,
    },
];

describe("OpportunityMasterDetail", () => {
    it("lists every opportunity with its served change (the prototype's second line) and selects the first", () => {
        render(<OpportunityMasterDetail items={items} filters={filters} />);

        const list = within(screen.getByTestId("opportunity-list"));
        expect(list.getByText("2 captured signals")).toBeInTheDocument();
        expect(list.getByText("+1,041% · captured change")).toBeVisible();
        expect(list.getByText("+12% · captured change")).toBeVisible();
        // the rationale sentence is in the detail card, not in the row
        expect(list.queryByText("Review Latency climbed 1041% in the last 14 days.")).toBeNull();
        expect(
            within(screen.getByTestId("opportunity-detail")).getByText(
                "Review Latency climbed 1041% in the last 14 days.",
            ),
        ).toBeInTheDocument();
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

    it("uses the prototype's 295px list column beside a flexible detail", () => {
        const { container } = render(<OpportunityMasterDetail items={items} filters={filters} />);

        expect((container.firstElementChild as HTMLElement).className).toContain(
            "lg:grid-cols-[295px_minmax(0,1fr)]",
        );
    });

    it("puts an arrow on every row and marks the selected row", () => {
        render(<OpportunityMasterDetail items={items} filters={filters} />);

        const rows = within(screen.getByTestId("opportunity-list")).getAllByRole("button");
        expect(rows).toHaveLength(2);
        for (const row of rows) expect(row.querySelector("svg")).not.toBeNull();
        expect(rows[0].className).toContain("border-(--accent)");
        expect(rows[1].className).not.toContain("border-(--accent)");
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

    it("a row whose change is not served reads Not reported, never 0%", () => {
        const fallback = [
            {
                id: "opp-0",
                title: "Maintain steady flow",
                rationale: "Key metrics are stable. Focus on sustaining current practices.",
                evidence_links: ["/api/v1/home?scope_type=org&scope_id=org-1"],
                suggested_experiments: ["Share the current playbook with new teams."],
                change_percent: null,
                direction: null,
                range_days: 14,
                compare_days: 14,
            },
        ];
        render(<OpportunityMasterDetail items={fallback} filters={filters} />);

        const list = within(screen.getByTestId("opportunity-list"));
        expect(list.getByText("Not reported · captured change")).toBeVisible();
        expect(screen.getByTestId("opportunity-list")).not.toHaveTextContent("0%");
    });
});
