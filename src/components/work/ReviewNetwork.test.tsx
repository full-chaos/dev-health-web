import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@/test/utils";

import {
    withoutEmailAddresses,
    type ReviewEdgeRow,
    type ServedReviewEdgeRow,
} from "@/lib/graphql/reviewEdgeIdentities";
import { aggregateReviewEdges, ReviewNetworkView } from "./ReviewNetwork";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));

const served = (
    reviewer: string,
    author: string,
    reviewsCount: number,
    day = "2026-09-01",
): ServedReviewEdgeRow => ({
    reviewer,
    author,
    reviewsCount,
    day,
    repoId: "repo-1",
});
/** Rows as the page gets them: the served rows through the server step that takes addresses out. */
const rowsOf = (...rows: ServedReviewEdgeRow[]): ReviewEdgeRow[] => withoutEmailAddresses(rows);
const row = (reviewer: string, author: string, reviewsCount: number, day = "2026-09-01") =>
    rowsOf(served(reviewer, author, reviewsCount, day))[0];
// People with a stored identity that is not an address (logins): the identity is the name.
const pairs = rowsOf(
    served("ana-fake", "bo-fake", 6),
    served("ana-fake", "bo-fake", 4, "2026-09-02"),
    served("cy-fake", "bo-fake", 5),
    served("ana-fake", "di-fake", 2),
);
// The same pairs where every stored identity is an e-mail address: no name is served.
const addressPairs = rowsOf(
    served("ana.fake@example.test", "bo.fake@example.test", 6),
    served("ana.fake@example.test", "bo.fake@example.test", 4, "2026-09-02"),
    served("cy.fake@example.test", "bo.fake@example.test", 5),
    served("ana.fake@example.test", "di.fake@example.test", 2),
);

describe("aggregation helpers", () => {
    beforeEach(() => refreshMock.mockClear());

    it("sums per pair and sorts most reviews first", () => {
        expect(
            aggregateReviewEdges(pairs).map((p) => [p.reviewerName, p.authorName, p.totalReviews]),
        ).toEqual([
            ["ana-fake", "bo-fake", 10],
            ["cy-fake", "bo-fake", 5],
            ["ana-fake", "di-fake", 2],
        ]);
    });

    it("keeps people with no served name apart: one pair per pair of keys", () => {
        expect(
            aggregateReviewEdges(addressPairs).map((p) => [
                p.reviewerName,
                p.authorName,
                p.totalReviews,
            ]),
        ).toEqual([
            [null, null, 10],
            [null, null, 5],
            [null, null, 2],
        ]);
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

    // CHAOS-7973 (ruling 51): a served name, else the stored identity, never an e-mail address.
    it("a person with no served name reads Not reported: no address, no part of it, no tooltip, no hidden text", () => {
        render(<ReviewNetworkView edges={addressPairs} loading={false} error={null} />);
        const panel = screen.getByTestId("review-network-panel");

        const cells = screen
            .getAllByTestId("review-network-row")
            .map((r) => within(r).getAllByRole("cell").slice(0, 2));
        for (const [reviewer, author] of cells) {
            expect(reviewer).toHaveTextContent(/^Not reported$/u);
            expect(author).toHaveTextContent(/^Not reported$/u);
        }
        // The whole card, attributes included: the old cell kept the address in `title` and in
        // text for a screen reader, and showed the part before "@".
        expect(panel.innerHTML).not.toContain("@");
        for (const part of ["ana.fake", "bo.fake", "cy.fake", "di.fake", "example.test"]) {
            expect(panel.innerHTML).not.toContain(part);
        }
        expect(panel.querySelectorAll("td [title]")).toHaveLength(0);
        expect(panel.querySelectorAll(".sr-only")).toHaveLength(0);
    });

    it("two people with no served name stay two rows, and the tiles count them", () => {
        render(<ReviewNetworkView edges={addressPairs} loading={false} error={null} />);

        expect(screen.getAllByTestId("review-network-row")).toHaveLength(3);
        const tiles = Array.from(screen.getByTestId("review-network-tiles").children).map(
            (tile) => tile.querySelector("p")?.textContent,
        );
        // Reviewers ana and cy, authors bo and di, 17 reviews: the same counts as with names.
        expect(tiles).toEqual(["2", "2", "17"]);
    });

    it("never shows an address, even when a row is handed over with one", () => {
        // Not a row the server step makes: the view is the second guard.
        const leaked: ReviewEdgeRow = {
            reviewer: "ana.fake@example.test",
            author: "bo-fake",
            reviewerName: "ana.fake@example.test",
            authorName: "Bo Fake <bo.fake@example.test>",
            reviewsCount: 3,
            day: "2026-09-01",
            repoId: "repo-1",
        };
        render(<ReviewNetworkView edges={[leaked]} loading={false} error={null} />);
        const panel = screen.getByTestId("review-network-panel");

        expect(panel.innerHTML).not.toContain("@");
        expect(panel.innerHTML).not.toContain("ana.fake");
        expect(panel.innerHTML).not.toContain("Bo Fake");
        const [reviewer, author] = within(screen.getByTestId("review-network-row")).getAllByRole(
            "cell",
        );
        expect(reviewer).toHaveTextContent(/^Not reported$/u);
        expect(author).toHaveTextContent(/^Not reported$/u);
    });

    it("a stored identity that is not an address is shown as the name, once", () => {
        render(
            <ReviewNetworkView
                edges={[row("Ana Fake", "bo-fake", 3)]}
                loading={false}
                error={null}
            />,
        );
        const only = screen.getByTestId("review-network-row");
        const [reviewer, author] = within(only).getAllByRole("cell");
        expect(reviewer).toHaveTextContent(/^Ana Fake$/u);
        expect(author).toHaveTextContent(/^bo-fake$/u);
        // The key of a person is never on screen.
        expect(only.innerHTML).not.toContain("stored:");
        expect(only.querySelectorAll(".sr-only")).toHaveLength(0);
        expect(only.querySelectorAll("[title]")).toHaveLength(0);
    });

    it("card text: the prototype sentence (not a ranking of people); the table-name sentence is gone", () => {
        render(<ReviewNetworkView edges={pairs} loading={false} error={null} />);
        const panel = screen.getByTestId("review-network-panel");
        expect(panel).toHaveTextContent(
            "Reviewer-to-author collaboration—not a performance ranking.",
        );
        expect(panel).not.toHaveTextContent("ranked by review count");
        expect(panel).not.toHaveTextContent("review_edges_daily");
        expect(panel).not.toHaveTextContent("Data sourced from");
    });

    it("tiles are one strip with a short note each, no delta and no trend", () => {
        render(<ReviewNetworkView edges={pairs} loading={false} error={null} />);
        const strip = screen.getByTestId("review-network-tiles");
        expect(strip).toHaveAttribute("data-columns", "3");
        expect(strip).toHaveTextContent("distinct reviewers in the pairs below");
        expect(strip).toHaveTextContent("distinct authors in the pairs below");
        expect(strip).toHaveTextContent("sum of the reviews counted in the pairs");
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
                edges={rowsOf(served("a-fake", "b-fake", 1000), served("c-fake", "d-fake", 1))}
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
        // The card keeps its one-line description; what the list leaves out is its own note.
        expect(screen.getByTestId("review-network-panel")).toHaveTextContent(
            "Reviewer-to-author collaboration—not a performance ranking.",
        );
        expect(screen.getByTestId("review-network-scope-notes")).toHaveTextContent(
            /^Automation accounts \(logins ending in \[bot\]\) and self-reviews are left out\.$/,
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
