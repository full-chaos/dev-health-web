import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@/test/utils";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";

import type { AIFilter } from "@/lib/filters/ai";

const { mockUseAIAttributedPrs, mockUseAIWorkflowDrilldown } = vi.hoisted(() => ({
    mockUseAIAttributedPrs: vi.fn(),
    mockUseAIWorkflowDrilldown: vi.fn(),
}));

vi.mock("@/lib/graphql/hooks/useAIReviewRisk", () => ({
    useAIAttributedPrs: mockUseAIAttributedPrs,
    useAIWorkflowDrilldownForPr: mockUseAIWorkflowDrilldown,
}));

import { AIImpactEvidenceList } from "../AIImpactEvidenceList";

const filter: AIFilter = { startDate: "2026-04-01", endDate: "2026-05-01" };

function attributedPrs(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        orgId: "org",
        startDate: filter.startDate,
        endDate: filter.endDate,
        total: 1,
        hasMore: false,
        dataAvailable: true,
        rows: [
            {
                repoId: "repo-1",
                number: 42,
                title: "Add caching",
                kind: "ai_assisted",
                workType: "feature",
                teamId: "team-1",
                mergedAt: null,
            },
        ],
        ...overrides,
    };
}

describe("AIImpactEvidenceList", () => {
    beforeEach(() => {
        mockUseAIAttributedPrs.mockReset();
        mockUseAIWorkflowDrilldown.mockReset();
        mockUseAIWorkflowDrilldown.mockReturnValue({
            data: undefined,
            fetching: false,
            error: undefined,
        });
    });

    it("renders attributed PR rows with provenance badges", () => {
        mockUseAIAttributedPrs.mockReturnValue({
            data: attributedPrs(),
            fetching: false,
            error: undefined,
        });

        render(<AIImpactEvidenceList filter={filter} />);

        expect(screen.getByTestId("ai-impact-evidence-row")).toBeInTheDocument();
        expect(screen.getByTestId("ai-attribution-badge")).toHaveTextContent("AI-assisted");
        expect(screen.getByTestId("ai-impact-evidence-count")).toHaveTextContent(
            "1 AI-attributed PRs",
        );
    });

    it("shows the degraded sparse-page state when a page is empty but the total is not", () => {
        mockUseAIAttributedPrs.mockReturnValue({
            data: attributedPrs({ rows: [], total: 37, hasMore: false }),
            fetching: false,
            error: undefined,
        });

        render(<AIImpactEvidenceList filter={filter} />);

        const sparse = screen.getByTestId("ai-impact-evidence-sparse-page");
        expect(sparse).toHaveTextContent("This page of results could not be loaded");
        expect(sparse).toHaveTextContent("37 AI-attributed PRs");
        // Pagination stays reachable so the user can navigate back.
        expect(screen.getByRole("button", { name: "Previous" })).toBeInTheDocument();
        expect(screen.queryByTestId("ai-impact-evidence-row")).not.toBeInTheDocument();
    });

    it("keeps connected-but-zero distinct from the sparse-page state", () => {
        mockUseAIAttributedPrs.mockReturnValue({
            data: attributedPrs({ rows: [], total: 0 }),
            fetching: false,
            error: undefined,
        });

        render(<AIImpactEvidenceList filter={filter} />);

        expect(screen.getByText("No AI-attributed PRs in this range")).toBeInTheDocument();
        expect(screen.queryByTestId("ai-impact-evidence-sparse-page")).not.toBeInTheDocument();
    });

    it("resets pagination and selection when the filter changes", () => {
        // Page 1 is populated with more pages; any later offset is a sparse
        // page (models a scope whose result set shrank under the old offset).
        mockUseAIAttributedPrs.mockImplementation(
            (_filter: AIFilter, _limit: number, offset = 0) =>
                offset === 0
                    ? {
                          data: attributedPrs({ total: 30, hasMore: true }),
                          fetching: false,
                          error: undefined,
                      }
                    : {
                          data: attributedPrs({ rows: [], total: 30, hasMore: false }),
                          fetching: false,
                          error: undefined,
                      },
        );

        const { rerender } = render(<AIImpactEvidenceList filter={filter} />);

        // Select a row (the drawer opens), then paginate forward into the sparse page.
        fireEvent.click(screen.getByTestId("ai-impact-evidence-row"));
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Next" }));
        expect(screen.getByTestId("ai-impact-evidence-sparse-page")).toBeInTheDocument();
        expect(mockUseAIAttributedPrs).toHaveBeenLastCalledWith(filter, 25, 25);

        // Scope change: offset must restart at page 1 (no stale-offset sparse
        // state) and the old scope's selection must not survive.
        const narrower: AIFilter = { ...filter, teamId: "team-2" };
        rerender(<AIImpactEvidenceList filter={narrower} />);

        expect(mockUseAIAttributedPrs).toHaveBeenLastCalledWith(narrower, 25, 0);
        expect(screen.getByTestId("ai-impact-evidence-row")).toBeInTheDocument();
        expect(screen.queryByTestId("ai-impact-evidence-sparse-page")).not.toBeInTheDocument();
        // The drawer of the old scope is closed too (CHAOS-8151).
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    describe("pins (CHAOS-7769)", () => {
        const ok = (data: unknown, extra: Record<string, unknown> = {}) =>
            mockUseAIAttributedPrs.mockReturnValue({
                data,
                fetching: false,
                error: undefined,
                ...extra,
            });

        it("keeps the column headers, cell texts and the empty-title and empty-date fallbacks", () => {
            ok(
                attributedPrs({
                    rows: [
                        {
                            repoId: "repo-1",
                            number: 7,
                            title: null,
                            kind: "agent_created",
                            workType: null,
                            teamId: null,
                            mergedAt: null,
                        },
                    ],
                }),
            );
            render(<AIImpactEvidenceList filter={filter} />);
            for (const h of ["PR", "Title", "Attribution", "Type", "Repo", "Merged"]) {
                expect(screen.getByRole("columnheader", { name: h })).toBeInTheDocument();
            }
            const row = screen.getByTestId("ai-impact-evidence-row");
            expect(row).toHaveTextContent("#7");
            expect(row).toHaveTextContent("(untitled)");
            expect(row).toHaveTextContent("repo-1");
            expect(row).toHaveTextContent("Agent-created");
            expect(row.querySelectorAll("td")[3]).toHaveTextContent("—");
            expect(row.querySelectorAll("td")[5]).toHaveTextContent("—");
        });

        const twoRows = () =>
            attributedPrs({
                total: 2,
                rows: [
                    ...attributedPrs().rows,
                    {
                        repoId: "repo-1",
                        number: 43,
                        title: "Refactor auth",
                        kind: "ai_assisted",
                        workType: "feature",
                        teamId: "team-1",
                        mergedAt: null,
                    },
                ],
            });

        it("has no inline evidence panel: nothing opens until a row is selected (CHAOS-8151)", () => {
            ok(attributedPrs());
            render(<AIImpactEvidenceList filter={filter} />);
            expect(screen.queryByTestId("ai-work-graph-evidence")).not.toBeInTheDocument();
            expect(screen.queryByTestId("ai-drilldown-evidence-prompt")).not.toBeInTheDocument();
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });

        it("selecting a row opens the shared drawer for that PR and loads its evidence by the row key", () => {
            ok(attributedPrs());
            render(<AIImpactEvidenceList filter={filter} />);
            const row = screen.getByTestId("ai-impact-evidence-row");
            fireEvent.click(row);
            const key = row.getAttribute("data-pr-key");
            expect(key).toBeTruthy();
            const dialog = screen.getByRole("dialog");
            expect(within(dialog).getByText("Work Graph evidence · PR #42")).toBeInTheDocument();
            expect(mockUseAIWorkflowDrilldown).toHaveBeenLastCalledWith(key);
            expect(screen.getByTestId("ai-impact-evidence-row").className).toContain(
                "var(--accent)",
            );
        });

        it("Enter on a focused row opens the drawer like a click", () => {
            ok(attributedPrs());
            render(<AIImpactEvidenceList filter={filter} />);
            const row = screen.getByTestId("ai-impact-evidence-row");
            expect(row).toHaveAttribute("tabindex", "0");
            fireEvent.keyDown(row, { key: "Enter" });
            expect(screen.getByRole("dialog")).toBeInTheDocument();
        });

        it("a second row replaces the subject, and closing the drawer clears the selection", () => {
            ok(twoRows());
            render(<AIImpactEvidenceList filter={filter} />);
            const rows = () => screen.getAllByTestId("ai-impact-evidence-row");
            fireEvent.click(rows()[0]);
            fireEvent.click(rows()[1]);
            expect(screen.getAllByRole("dialog")).toHaveLength(1);
            expect(
                within(screen.getByRole("dialog")).getByText("Work Graph evidence · PR #43"),
            ).toBeInTheDocument();
            // Only the second row carries the selection edge.
            expect(rows()[0].className).not.toContain("var(--accent)");
            expect(rows()[1].className).toContain("var(--accent)");
            fireEvent.keyDown(document, { key: "Escape" });
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
            expect(rows()[1].className).not.toContain("var(--accent)");
        });

        it("keeps the loading row, the error card and the not-populated state", () => {
            ok(undefined, { fetching: true });
            const { unmount } = render(<AIImpactEvidenceList filter={filter} />);
            expect(screen.getByTestId("ai-impact-evidence-loading")).toHaveTextContent(
                "Loading AI-attributed pull requests…",
            );
            unmount();

            ok(undefined, { error: new Error("boom") });
            const second = render(<AIImpactEvidenceList filter={filter} />);
            expect(screen.getByText("Failed to load AI-attributed PRs")).toBeInTheDocument();
            second.unmount();

            ok(attributedPrs({ dataAvailable: false }));
            render(<AIImpactEvidenceList filter={filter} />);
            expect(
                screen.getByText("AI attribution data has not populated yet"),
            ).toBeInTheDocument();
        });

        it("disables Previous on page 1 and Next without more pages", () => {
            ok(attributedPrs({ hasMore: false }));
            render(<AIImpactEvidenceList filter={filter} />);
            expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
            expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
        });
    });
});
