import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BlockedWorkItemsTable } from "./BlockedWorkEvidence";

const base = {
    provider: "jira",
    status: "blocked" as const,
    team_id: null,
    cycle_time_hours: null,
    lead_time_hours: null,
    started_at: null,
    completed_at: null,
};

describe("BlockedWorkItemsTable work item column (CHAOS-8959)", () => {
    it("shows the served title, Unresolved when null or absent, never the id", () => {
        const { container } = render(
            <BlockedWorkItemsTable
                blockedIssues={{
                    count: 3,
                    items: [
                        { ...base, work_item_id: "jira:OPS-1", title: "Fix login redirect" },
                        { ...base, work_item_id: "jira:OPS-2", title: null },
                        { ...base, work_item_id: "jira:OPS-3" },
                    ],
                }}
            />,
        );
        expect(screen.getByText("Fix login redirect")).toBeInTheDocument();
        expect(screen.getAllByText("Unresolved").length).toBeGreaterThanOrEqual(2);
        expect(container.textContent).not.toMatch(/OPS-\d/);
    });
});
