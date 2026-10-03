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

// What the API serves for a person (CHAOS-8485): a display name, null when none is known, and an
// opaque key. A test person is written as one text. A login is served as the name. A person the
// API has no name for is written as an e-mail address here: the API serves a null name and a key
// that is not the address.
const personKeys = new Map<string, string>();
const person = (who: string) => {
    if (!personKeys.has(who)) personKeys.set(who, `p${personKeys.size + 1}`);
    return { key: personKeys.get(who)!, name: who.includes("@") ? null : who };
};
const served = (
    reviewer: string,
    author: string,
    reviewsCount: number,
    day = "2026-09-01",
): ServedReviewEdgeRow => ({
    reviewerKey: person(reviewer).key,
    authorKey: person(author).key,
    reviewerName: person(reviewer).name,
    authorName: person(author).name,
    reviewsCount,
    day,
    repoId: "repo-1",
});
/** Rows as the page gets them: the served rows through the last server step. */
const rowsOf = (...rows: ServedReviewEdgeRow[]): ReviewEdgeRow[] => withoutEmailAddresses(rows);
const row = (reviewer: string, author: string, reviewsCount: number, day = "2026-09-01") =>
    rowsOf(served(reviewer, author, reviewsCount, day))[0];
// People the API serves a name for.
const pairs = rowsOf(
    served("ana-fake", "bo-fake", 6),
    served("ana-fake", "bo-fake", 4, "2026-09-02"),
    served("cy-fake", "bo-fake", 5),
    served("ana-fake", "di-fake", 2),
);
// The same pairs where the API serves no name for any person.
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

    it("a served name is shown as the name, once; the key of a person is never on screen", () => {
        const shown = row("Ana Fake", "bo-fake", 3);
        render(<ReviewNetworkView edges={[shown]} loading={false} error={null} />);
        const only = screen.getByTestId("review-network-row");
        const [reviewer, author] = within(only).getAllByRole("cell");
        expect(reviewer).toHaveTextContent(/^Ana Fake$/u);
        expect(author).toHaveTextContent(/^bo-fake$/u);
        expect(shown.reviewer).not.toBe(shown.author);
        expect(only.innerHTML).not.toContain(shown.reviewer);
        expect(only.innerHTML).not.toContain(shown.author);
        expect(only.innerHTML).not.toContain("key:");
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
});
