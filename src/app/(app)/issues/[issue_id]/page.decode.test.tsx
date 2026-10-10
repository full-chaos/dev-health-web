import { beforeEach, describe, expect, it, vi } from "vitest";

import { getFlame } from "@/lib/api/visuals";
import {
    getAIWorkflowDrilldownViaGraphQL,
    getWorkUnitInvestmentDistribution,
} from "@/lib/graphql/workGraphFetchers";

import IssueDetailPage from "./page";

// CHAOS-9117: Next gives the page the segment still encoded (`jira%3AKEY-1`), for a raw link and
// for an appPath() link. The page decodes it once, as prs/[pr_id] does, before it asks for the
// record: a query value and a GraphQL variable are not decoded by the backend.

vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/api/visuals", () => ({ getFlame: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/auth", () => ({
    requireSession: vi.fn().mockResolvedValue({ user: { org_id: "org-1" } }),
}));
vi.mock("@/lib/graphql/workGraphFetchers", () => ({
    getAIWorkflowDrilldownViaGraphQL: vi.fn().mockResolvedValue(null),
    getWorkUnitInvestmentDistribution: vi.fn(),
}));

beforeEach(() => {
    vi.clearAllMocks();
});

describe.each([
    ["jira:KEY-1", "jira%3AKEY-1"],
    ["gh:owner/repo#12", "gh%3Aowner%2Frepo%2312"],
])("issue page for the id %s", (id, segment) => {
    it("asks for the decoded id", async () => {
        await IssueDetailPage({ params: Promise.resolve({ issue_id: segment }) });

        expect(getFlame).toHaveBeenCalledWith({ entity_type: "issue", entity_id: id });
        expect(getAIWorkflowDrilldownViaGraphQL).toHaveBeenCalledWith(
            expect.objectContaining({ rootId: id }),
        );
        expect(getWorkUnitInvestmentDistribution).toHaveBeenCalledWith({
            rootType: "ISSUE",
            rootId: id,
        });
    });
});
