import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@/test/utils";

import type { ReviewEdgeRow } from "@/lib/graphql/reviewEdgesFetchers";
import { aggregateReviewEdges, identityLocalPart, ReviewNetworkView } from "./ReviewNetwork";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));

const row = (
    reviewer: string,
    author: string,
    reviewsCount: number,
    day = "2026-09-01",
): ReviewEdgeRow => ({
    reviewer,
    author,
    reviewsCount,
    day,
    repoId: "repo-1",
});
const pairs = [
    row("ana.fake@example.test", "bo.fake@example.test", 6),
    row("ana.fake@example.test", "bo.fake@example.test", 4, "2026-09-02"),
    row("cy.fake@example.test", "bo.fake@example.test", 5),
    row("ana.fake@example.test", "di.fake@example.test", 2),
];

describe("aggregation helpers", () => {
    beforeEach(() => refreshMock.mockClear());

    it("sums per pair and sorts most reviews first", () => {
        expect(
            aggregateReviewEdges(pairs).map((p) => [p.reviewer, p.author, p.totalReviews]),
        ).toEqual([
            ["ana.fake@example.test", "bo.fake@example.test", 10],
            ["cy.fake@example.test", "bo.fake@example.test", 5],
            ["ana.fake@example.test", "di.fake@example.test", 2],
        ]);
    });

    it("the local part is what precedes @; an identity without @ is whole", () => {
        expect(identityLocalPart("ana.fake@example.test")).toBe("ana.fake");
        expect(identityLocalPart("Ana Fake")).toBe("Ana Fake");
        expect(identityLocalPart("@odd")).toBe("@odd");
    });
});

describe("ReviewNetworkView restyle", () => {
    it("table: Reviewer, Author, Reviews, Share, in reviews order", () => {
        render(<ReviewNetworkView edges={pairs} loading={false} error={null} />);
        const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
        expect(headers).toEqual(["Reviewer", "Author", "Reviews", "Share"]);
        const counts = screen
            .getAllByTestId("review-network-row")
            .map((r) => within(r).getAllByRole("cell")[2].textContent);
        expect(counts).toEqual(["10", "5", "2"]);
    });

    it("a person shows as the local part: no @domain text on screen, the full identity in the tooltip and for a screen reader", () => {
        render(<ReviewNetworkView edges={pairs} loading={false} error={null} />);
        const first = screen.getAllByTestId("review-network-row")[0];
        expect(within(first).getByTitle("ana.fake@example.test")).toHaveTextContent("ana.fake");
        // visible text carries no domain; the sr-only copy holds the full identity
        const visible = Array.from(first.querySelectorAll("td")).map((td) =>
            Array.from(td.childNodes)
                .filter((n) => !(n instanceof HTMLElement && n.classList.contains("sr-only")))
                .map((n) => n.textContent)
                .join(""),
        );
        expect(visible.join(" ")).not.toContain("@");
        const sr = first.querySelectorAll(".sr-only");
        expect(Array.from(sr).map((e) => e.textContent)).toEqual([
            " (ana.fake@example.test)",
            " (bo.fake@example.test)",
        ]);
    });

    it("an identity without @ is shown once, with no duplicate for a screen reader", () => {
        render(
            <ReviewNetworkView
                edges={[row("Ana Fake", "Bo Fake", 3)]}
                loading={false}
                error={null}
            />,
        );
        const only = screen.getByTestId("review-network-row");
        expect(only.textContent?.match(/Ana Fake/g)).toHaveLength(1);
        expect(only.querySelectorAll(".sr-only")).toHaveLength(0);
    });

    it("card text: the first sentence stays word for word, the table-name sentence is gone", () => {
        render(<ReviewNetworkView edges={pairs} loading={false} error={null} />);
        const panel = screen.getByTestId("review-network-panel");
        expect(panel).toHaveTextContent(
            "Reviewer→author collaboration pairs from code review activity, ranked by review count.",
        );
        expect(panel).not.toHaveTextContent("review_edges_daily");
        expect(panel).not.toHaveTextContent("Data sourced from");
    });

    it("tiles carry the three numbers only: no delta, no trend", () => {
        render(<ReviewNetworkView edges={pairs} loading={false} error={null} />);
        const tiles = screen.getByTestId("review-network-tiles");
        expect(tiles).not.toHaveTextContent("No prior period");
        expect(tiles).not.toHaveTextContent("No trend yet");
        expect(within(tiles).queryByTestId("sparkline")).toBeNull();
    });

    it("share bar: first series token, the top pair full, others their share, 2px floor, decoration only", () => {
        render(
            <ReviewNetworkView
                edges={[row("a@x.test", "b@x.test", 1000), row("c@x.test", "d@x.test", 1)]}
                loading={false}
                error={null}
            />,
        );
        const fills = document.querySelectorAll<HTMLElement>("[data-share-fill]");
        expect(Array.from(fills).map((f) => f.style.width)).toEqual(["100%", "0%"]);
        expect(fills[1].style.minWidth).toBe("2px");
        for (const fill of fills) {
            expect(fill.className).toContain("bg-(--chart-color-1)");
            expect(fill.className).not.toMatch(/accent/u);
            expect(fill.parentElement).toHaveAttribute("aria-hidden", "true");
        }
    });

    it("error: same title and message, with a Retry that refreshes the page data", () => {
        refreshMock.mockClear();
        render(<ReviewNetworkView edges={null} loading={false} error="boom" />);
        expect(screen.getByText("Failed to load review network")).toBeInTheDocument();
        expect(screen.getByText("boom")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(refreshMock).toHaveBeenCalledTimes(1);
    });

    it("empty and loading use the shared states with their texts", () => {
        const { unmount } = render(<ReviewNetworkView edges={[]} loading={false} error={null} />);
        expect(screen.getByText("No review relationships to show")).toBeInTheDocument();
        unmount();
        render(<ReviewNetworkView edges={null} loading error={null} />);
        expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    });

    it("description names what is left out, the empty state says so too, and there is no count notice without a cut", () => {
        const { unmount } = render(
            <ReviewNetworkView edges={pairs} loading={false} error={null} />,
        );
        expect(screen.getByTestId("review-network-panel")).toHaveTextContent(
            "Reviewer→author collaboration pairs from code review activity, ranked by review count. Automation accounts (logins ending in [bot]) and self-reviews are left out.",
        );
        expect(screen.queryByTestId("review-network-count-notice")).toBeNull();
        unmount();
        render(<ReviewNetworkView edges={[]} loading={false} error={null} />);
        expect(
            screen.getByText(
                "No reviews between different people were recorded in this scope and window (automation accounts and self-reviews are left out). Widen the date range or change the repo or team filter.",
            ),
        ).toBeInTheDocument();
    });

    describe("count notice and team caption (CHAOS-7786, CHAOS-7785)", () => {
        const notice = () => screen.queryByTestId("review-network-count-notice");
        const view = (props: { totalCount?: number | null; teamScope?: boolean }) =>
            render(<ReviewNetworkView edges={pairs} loading={false} error={null} {...props} />);

        it("says the list is cut when more records match than came back, with both numbers", () => {
            view({ totalCount: 1820 });
            expect(notice()).toHaveTextContent(
                "Showing the 4 largest of 1,820 daily review records. Pairs and totals below count only the records shown; narrow the window or the repo or team filter to see the rest.",
            );
            expect(notice()).toHaveAttribute("data-notice-variant", "info");
            expect(notice()).not.toHaveAttribute("role");
        });

        it("shows no notice when nothing is cut: equal, fewer, or unknown", () => {
            for (const totalCount of [4, 3, 0, null, undefined]) {
                const { unmount } = view({ totalCount });
                expect(notice(), String(totalCount)).toBeNull();
                unmount();
            }
        });

        it("one more record than came back is already a cut", () => {
            view({ totalCount: 5 });
            expect(notice()).toHaveTextContent("Showing the 4 largest of 5 daily review records");
        });

        it("the team caption appears only with a team scope, and says ownership, not membership", () => {
            const { unmount } = view({ teamScope: true });
            expect(screen.getByTestId("review-network-team-caption")).toHaveTextContent(
                "Team scope: pairs on repositories this team owns. Reviewers and authors may belong to other teams.",
            );
            unmount();
            view({ teamScope: false });
            expect(screen.queryByTestId("review-network-team-caption")).toBeNull();
        });

        it("no notice over the loading, error and empty states", () => {
            const { unmount } = render(
                <ReviewNetworkView edges={null} totalCount={900} loading error={null} />,
            );
            expect(notice()).toBeNull();
            unmount();
            render(<ReviewNetworkView edges={[]} totalCount={900} loading={false} error={null} />);
            expect(notice()).toBeNull();
        });
    });
});
