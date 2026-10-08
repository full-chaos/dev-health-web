import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@/test/utils";
import userEvent from "@testing-library/user-event";

import { AIOpportunityList } from "../AIOpportunityList";
import type { AiOpportunity } from "@/lib/graphql/__generated__/types";

const { mockUseAIWorkflowDrilldown } = vi.hoisted(() => ({ mockUseAIWorkflowDrilldown: vi.fn() }));

vi.mock("@/lib/graphql/hooks/useAIReviewRisk", () => ({
    useAIWorkflowDrilldown: mockUseAIWorkflowDrilldown,
}));

const recommendation: AiOpportunity = {
    opportunityId: "opp-1",
    kind: "HIGH_REVIEW_LOAD",
    repoId: "repo-1",
    teamId: "team-platform",
    title: "Automate dependency updates",
    rationale: "Recurring dependency PRs match the AI-assisted heuristic.",
    score: 0.78,
    evidenceRefs: ["git_pull_requests:repo-1:1001"],
    workGraphDrilldowns: [{ rootType: "pr", rootId: "repo-1#1001", label: "PR 1001" }],
};

describe("AIOpportunityList", () => {
    beforeEach(() => {
        mockUseAIWorkflowDrilldown.mockReset();
        mockUseAIWorkflowDrilldown.mockReturnValue({
            fetching: false,
            error: undefined,
            data: {
                orgId: "org",
                rootType: "PR",
                rootId: "repo-1#1001",
                partial: false,
                dataAvailable: true,
                nodes: [{ nodeType: "PR", nodeId: "repo-1#1001" }],
                edges: [
                    {
                        edgeId: "edge-1",
                        sourceType: "PR",
                        sourceId: "repo-1#1001",
                        targetType: "REVIEW_OUTCOME",
                        targetId: "approved",
                        edgeType: "HAS_REVIEW_OUTCOME",
                        confidence: 0.9,
                        source: "msw",
                        evidence: "Approved after focused updates.",
                        provider: "github",
                        repoId: "repo-1",
                    },
                ],
            },
        });
    });

    it("opens Work Graph evidence from recommendation drilldown refs", async () => {
        render(<AIOpportunityList detectorReady recommendations={[recommendation]} />);

        await userEvent.click(screen.getByRole("button", { name: /Work Graph: PR 1001/i }));

        expect(mockUseAIWorkflowDrilldown).toHaveBeenCalledWith("pr", "repo-1#1001", { limit: 25 });
        // The edge type is in words, as in the PR explorer (A7), not the served token.
        expect(screen.getByTestId("ai-opportunity-workgraph-evidence")).toHaveTextContent(
            "Has review outcome",
        );
        expect(screen.getByTestId("ai-opportunity-workgraph-evidence")).not.toHaveTextContent(
            "HAS_REVIEW_OUTCOME",
        );
        expect(screen.getByTestId("ai-opportunity-workgraph-evidence")).toHaveTextContent(
            "Approved after focused updates.",
        );
    });

    describe("readable names, not full UUIDs (design A5, AD-3)", () => {
        const UUID = "920f9442-07df-4217-9ca8-3b1e5a7d2c10";
        const withIds: AiOpportunity = {
            ...recommendation,
            title: `Mechanical migration toil in ${UUID}`,
            rationale: `Repeated edits in ${UUID} match one pattern.`,
            workGraphDrilldowns: [{ rootType: "pr", rootId: "r#1", label: `PR ${UUID}` }],
        };

        it("shows a plain phrase in the title, rationale and chip, and the full id only in the tooltip", () => {
            render(<AIOpportunityList detectorReady recommendations={[withIds]} />);
            const list = document.body;
            expect(list.textContent).not.toContain(UUID);
            const title = screen.getByText("Mechanical migration toil in an unresolved item");
            expect(title).toHaveAttribute("title", `Mechanical migration toil in ${UUID}`);
            expect(
                screen.getByText("Repeated edits in an unresolved item match one pattern."),
            ).toHaveAttribute("title", `Repeated edits in ${UUID} match one pattern.`);
            const chip = screen.getByRole("button", { name: /Work Graph: PR an unresolved item/ });
            expect(chip).toHaveAttribute("title", `PR ${UUID}`);
        });

        it("the Loading line for a chosen chip does not print the full id either", async () => {
            mockUseAIWorkflowDrilldown.mockReturnValue({
                fetching: true,
                error: undefined,
                data: undefined,
            });
            render(<AIOpportunityList detectorReady recommendations={[withIds]} />);
            await userEvent.click(
                screen.getByRole("button", { name: /Work Graph: PR an unresolved item/ }),
            );
            expect(
                screen.getByText(/Loading Work Graph evidence for PR an unresolved item/),
            ).toBeInTheDocument();
            expect(document.body.textContent).not.toContain(UUID);
        });

        it("a served name is shown as served, with no tooltip", () => {
            render(<AIOpportunityList detectorReady recommendations={[recommendation]} />);
            const title = screen.getByText("Automate dependency updates");
            expect(title).not.toHaveAttribute("title");
            expect(screen.getByRole("button", { name: /Work Graph: PR 1001/ })).not.toHaveAttribute(
                "title",
            );
        });
    });

    // CHAOS-8114: the API serves the repository and team names of an opportunity. A name that is not
    // served reads "Not reported"; the id is never drawn as a name.
    describe("repository and team names", () => {
        const scope = () => screen.getByTestId("ai-opportunity-scope").textContent;

        it("shows the served repository and team names, and no id", () => {
            render(
                <AIOpportunityList
                    detectorReady
                    recommendations={[
                        { ...recommendation, repoName: "acme/alpha", teamName: "Platform" },
                    ]}
                />,
            );
            expect(scope()).toBe("HIGH REVIEW LOAD · acme/alpha · Platform");
        });

        it("draws the kind in capitals and keeps the case of a served name", () => {
            render(
                <AIOpportunityList
                    detectorReady
                    recommendations={[
                        { ...recommendation, repoName: "acme/Alpha", teamName: "Platform Team" },
                    ]}
                />,
            );
            const line = screen.getByTestId("ai-opportunity-scope");
            // Capitals on the whole line would draw a served name in capitals: its case is lost.
            expect(line.className).not.toContain("uppercase");
            expect(within(line).getByText("HIGH REVIEW LOAD").className).toContain("uppercase");
            for (const name of ["acme/Alpha", "Platform Team"]) {
                expect(within(line).getByText(name).className).not.toContain("uppercase");
            }
            expect(line.textContent).toBe("HIGH REVIEW LOAD · acme/Alpha · Platform Team");
        });

        it.each([null, undefined, "", "   "])(
            "reads 'Not reported' for a repository name that is %j, never the id",
            (repoName) => {
                render(
                    <AIOpportunityList
                        detectorReady
                        recommendations={[{ ...recommendation, repoName, teamName: "Platform" }]}
                    />,
                );
                expect(scope()).toBe("HIGH REVIEW LOAD · Repository: Not reported · Platform");
                expect(scope()).not.toContain("repo-1");
            },
        );

        it.each([null, undefined, "", "   "])(
            "reads 'Not reported' for a team name that is %j, never the id",
            (teamName) => {
                render(
                    <AIOpportunityList
                        detectorReady
                        recommendations={[{ ...recommendation, repoName: "acme/alpha", teamName }]}
                    />,
                );
                expect(scope()).toBe("HIGH REVIEW LOAD · acme/alpha · Team: Not reported");
                expect(scope()).not.toContain("team-platform");
            },
        );

        it("draws no repository or team part for a row that has no repository or team", () => {
            render(
                <AIOpportunityList
                    detectorReady
                    recommendations={[
                        {
                            ...recommendation,
                            repoId: null,
                            teamId: null,
                            repoName: null,
                            teamName: null,
                        },
                    ]}
                />,
            );
            expect(scope()).toBe("HIGH REVIEW LOAD");
        });

        it("does not draw a name for a row with no team, even if one is served", () => {
            render(
                <AIOpportunityList
                    detectorReady
                    recommendations={[
                        {
                            ...recommendation,
                            repoName: "acme/alpha",
                            teamId: null,
                            teamName: "Stray",
                        },
                    ]}
                />,
            );
            expect(scope()).toBe("HIGH REVIEW LOAD · acme/alpha");
        });
    });
});
