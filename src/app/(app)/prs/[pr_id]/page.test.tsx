import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const checkApiHealthMock = vi.fn();
const getFlameMock = vi.fn();
const requireSessionMock = vi.fn();
const getPrDetailViaGraphQLMock = vi.fn();
const getAIWorkflowDrilldownViaGraphQLMock = vi.fn();
const getWorkUnitInvestmentDistributionMock = vi.fn();

vi.mock("@/components/navigation/PrimaryNav", () => ({
    PrimaryNav: () => <nav data-testid="primary-nav" />,
}));

vi.mock("@/components/charts/FlameDiagram", () => ({
    FlameDiagram: () => <div data-testid="flame-diagram" />,
}));

vi.mock("@/components/ClientTimestamp", () => ({
    ClientTimestamp: ({ value, suffix = "" }: { value: string; suffix?: string }) => (
        <span>{`${value}${suffix}`}</span>
    ),
}));

vi.mock("@/lib/api/system", () => ({
    checkApiHealth: () => checkApiHealthMock(),
}));

vi.mock("@/lib/api/visuals", () => ({
    getFlame: (...args: unknown[]) => getFlameMock(...args),
}));

vi.mock("@/lib/auth", () => ({
    requireSession: () => requireSessionMock(),
}));

vi.mock("@/lib/graphql/workGraphFetchers", () => ({
    getPrDetailViaGraphQL: (...args: unknown[]) => getPrDetailViaGraphQLMock(...args),
    getAIWorkflowDrilldownViaGraphQL: (...args: unknown[]) =>
        getAIWorkflowDrilldownViaGraphQLMock(...args),
    getWorkUnitInvestmentDistribution: (...args: unknown[]) =>
        getWorkUnitInvestmentDistributionMock(...args),
}));

import PrDetailPage from "./page";

const prId = "11111111-1111-1111-1111-111111111111#pr42";

const samplePr = {
    id: prId,
    orgId: "org-1",
    repoId: "11111111-1111-1111-1111-111111111111",
    repoName: "full-chaos/dev-health-web",
    number: 42,
    title: "Wire PR detail",
    body: "body",
    state: "merged",
    authorName: "Ada",
    authorEmail: "ada@example.com",
    createdAt: "2026-06-01T12:00:00Z",
    mergedAt: "2026-06-01T13:00:00Z",
    closedAt: null,
    headBranch: "feature/pr-detail",
    baseBranch: "main",
    additions: 12,
    deletions: 3,
    changedFiles: 4,
    firstReviewAt: "2026-06-01T12:30:00Z",
    firstCommentAt: "2026-06-01T12:10:00Z",
    changesRequestedCount: 1,
    reviewsCount: 2,
    commentsCount: 5,
    reviews: [
        {
            reviewId: "r1",
            reviewer: "reviewer@example.com",
            state: "APPROVED",
            submittedAt: "2026-06-01T12:35:00Z",
        },
    ],
    commits: [
        {
            hash: "abcdef1234567890",
            message: "commit message",
            authorName: "Ada",
            authorEmail: "ada@example.com",
            authorWhen: "2026-06-01T12:05:00Z",
            confidence: 0.99,
            provenance: "native",
            evidence: "api_pr_commits",
        },
    ],
    linkedIssues: [],
};

const emptyDrilldown = {
    orgId: "org-1",
    rootType: "PR",
    rootId: prId,
    nodes: [],
    edges: [],
    partial: false,
    dataAvailable: false,
};

const demoInvestment = {
    workUnitId: prId,
    themeDistribution: { feature_delivery: 1 },
    subcategoryDistribution: { "feature_delivery.roadmap": 1 },
    evidenceQuotes: [{ quote: "demo quote", sourceType: "pr", sourceId: prId }],
};

async function renderPage(id = prId) {
    const ui = await PrDetailPage({ params: Promise.resolve({ pr_id: id }) });
    render(ui as React.ReactElement);
}

describe("PrDetailPage", () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
        checkApiHealthMock.mockReset();
        getFlameMock.mockReset();
        requireSessionMock.mockReset();
        getPrDetailViaGraphQLMock.mockReset();
        getAIWorkflowDrilldownViaGraphQLMock.mockReset();
        getWorkUnitInvestmentDistributionMock.mockReset();
        checkApiHealthMock.mockResolvedValue({ ok: true });
        requireSessionMock.mockResolvedValue({ user: { org_id: "org-1" } });
        getFlameMock.mockResolvedValue(null);
        getPrDetailViaGraphQLMock.mockResolvedValue(samplePr);
        getAIWorkflowDrilldownViaGraphQLMock.mockResolvedValue(emptyDrilldown);
        getWorkUnitInvestmentDistributionMock.mockReturnValue(demoInvestment);
    });

    it("renders populated PR detail from live GraphQL data", async () => {
        await renderPage();

        expect(screen.getByRole("heading", { name: "PR detail" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Wire PR detail" })).toBeInTheDocument();
        expect(screen.getByText("full-chaos/dev-health-web · #42")).toBeInTheDocument();
        expect(screen.getByText("reviewer@example.com")).toBeInTheDocument();
        expect(screen.getByText(/abcdef12/)).toBeInTheDocument();
        expect(getPrDetailViaGraphQLMock).toHaveBeenCalledWith({ orgId: "org-1", id: prId });
        expect(getAIWorkflowDrilldownViaGraphQLMock).toHaveBeenCalledWith({
            orgId: "org-1",
            rootType: "PR",
            rootId: prId,
            useDemoFallback: false,
        });
        expect(getWorkUnitInvestmentDistributionMock).not.toHaveBeenCalled();
    });

    it("renders honest empty state without requesting live related entities for a missing PR", async () => {
        getPrDetailViaGraphQLMock.mockResolvedValue(null);

        await renderPage("bad-id");

        expect(screen.getByText(/No PR detail found for this id/i)).toBeInTheDocument();
        expect(screen.getByText("No data for related entities.")).toBeInTheDocument();
        expect(getAIWorkflowDrilldownViaGraphQLMock).not.toHaveBeenCalled();
    });

    it("renders backend error state when the PR detail GraphQL query fails", async () => {
        getPrDetailViaGraphQLMock.mockRejectedValue(new Error("boom"));

        await renderPage();

        expect(
            screen.getByText(/PR detail could not be loaded from the backend/i),
        ).toBeInTheDocument();
        expect(getAIWorkflowDrilldownViaGraphQLMock).not.toHaveBeenCalled();
    });

    it("keeps demo fallback behind explicit test mode", async () => {
        vi.stubEnv("DEV_HEALTH_TEST_MODE", "true");
        getPrDetailViaGraphQLMock.mockResolvedValue(null);
        getAIWorkflowDrilldownViaGraphQLMock.mockResolvedValue({
            ...emptyDrilldown,
            dataAvailable: true,
            edges: [
                {
                    edgeId: "edge-1",
                    sourceType: "PR",
                    sourceId: prId,
                    targetType: "COMMIT",
                    targetId: "abcdef1234567890",
                    edgeType: "CONTAINS",
                    confidence: 0.99,
                    source: "native",
                    evidence: "api_pr_commits",
                    provider: "github",
                    repoId: samplePr.repoId,
                },
            ],
        });

        await renderPage();

        expect(getAIWorkflowDrilldownViaGraphQLMock).toHaveBeenCalledWith({
            orgId: "org-1",
            rootType: "PR",
            rootId: prId,
            useDemoFallback: true,
        });
        expect(getWorkUnitInvestmentDistributionMock).toHaveBeenCalledWith({
            rootType: "PR",
            rootId: prId,
        });
        const evidence = screen.getByRole("heading", { name: "Commits" }).closest("div");
        expect(evidence).not.toBeNull();
        if (evidence === null) throw new Error("Expected commits evidence panel");
        expect(within(evidence).getByText("abcdef1234567890")).toBeInTheDocument();
    });

    it("renders a distinct error state when the related-entities fetch fails, not 'No data'", async () => {
        getAIWorkflowDrilldownViaGraphQLMock.mockRejectedValue(
            new Error("Work Graph drilldown unavailable"),
        );

        await renderPage();

        expect(screen.getByTestId("related-entities-error")).toBeInTheDocument();
        expect(screen.getByText(/Related work unavailable/i)).toBeInTheDocument();
        expect(screen.queryByText("No data for related entities.")).not.toBeInTheDocument();
    });
});
