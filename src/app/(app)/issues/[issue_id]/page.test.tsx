import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const askDevTriggerMock = vi.fn();
const getFlameMock = vi.fn();

vi.mock("@/components/ask-dev/AskDevTrigger", () => ({
    AskDevTrigger: ({ context }: { context: unknown }) => {
        askDevTriggerMock(context);
        return <button type="button">Ask Dev about this</button>;
    },
}));
vi.mock("@/components/charts/FlameDiagram", () => ({ FlameDiagram: () => null }));
vi.mock("@/components/navigation/PrimaryNav", () => ({ PrimaryNav: () => null }));
vi.mock("@/components/ClientTimestamp", () => ({ ClientTimestamp: () => null }));
vi.mock("@/components/work/RelatedEntitiesPanel", () => ({
    RelatedEntitiesPanel: () => null,
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/api/visuals", () => ({
    getFlame: (...args: unknown[]) => getFlameMock(...args),
}));
vi.mock("@/lib/auth", () => ({
    requireSession: vi.fn().mockResolvedValue({ user: { org_id: "org-1" } }),
}));
vi.mock("@/lib/graphql/workGraphFetchers", () => ({
    getAIWorkflowDrilldownViaGraphQL: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
    getWorkUnitInvestmentDistribution: vi.fn().mockReturnValue({}),
}));

import IssueDetailPage from "./page";

describe("Issue detail Ask Dev entry point", () => {
    beforeEach(() => {
        askDevTriggerMock.mockReset();
        getFlameMock.mockReset().mockResolvedValue({
            entity: { work_item_id: "CHAOS-3216", title: "Sensitive page title" },
            timeline: { start: "2026-07-01T00:00:00Z", end: "2026-07-29T00:00:00Z" },
            frames: [],
        });
    });

    it("hands off the approved issue ID and label without rendered issue content", async () => {
        const ui = await IssueDetailPage({
            params: Promise.resolve({ issue_id: "issue-opaque-id" }),
        });
        render(ui);

        expect(screen.getByRole("button", { name: "Ask Dev about this" })).toBeInTheDocument();
        expect(askDevTriggerMock).toHaveBeenCalledWith({
            routeId: "issue_detail",
            entityRefs: [
                {
                    entity_type: "issue",
                    entity_id: "issue-opaque-id",
                    display_label: "CHAOS-3216",
                },
            ],
            suggestedQuestionIds: ["remaining_work", "data_trust"],
        });
        expect(JSON.stringify(askDevTriggerMock.mock.calls)).not.toContain("Sensitive page title");
    });
});
