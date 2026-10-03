import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import type { OperatingReview } from "@/lib/graphql/types";

const { fetchReview } = vi.hoisted(() => ({ fetchReview: vi.fn() }));

vi.mock("next/navigation", () => ({
    usePathname: () => "/operating-review",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div /> }));
vi.mock("@/components/shell/PageHeader", () => ({
    PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/auth", () => ({
    auth: vi.fn().mockResolvedValue({ user: { org_id: "org-1" } }),
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("@/lib/graphql/operatingReviewFetchers", () => ({
    getOperatingReviewViaGraphQL: fetchReview,
}));

import OperatingReviewPage from "./page";

// The API answers the review of several teams together (`teamIds`): one request, and the web
// computes nothing. Each metric says whether the team selection narrows it (`scope`).

const metric = (key: string, value: number, scope?: "TEAM" | "ORGANIZATION") => ({
    key,
    label: `Label ${key}`,
    value,
    unit: "",
    hasData: true,
    ...(scope ? { scope } : {}),
    delta: {
        value,
        priorValue: 4,
        absolute: 1,
        percent: 25,
        status: "changed",
        hasPriorData: true,
    },
});

const served = {
    orgId: "org-1",
    teamId: null,
    weekStart: "2026-09-28",
    priorWeekStart: "2026-09-21",
    recommendations: ["Served recommendation"],
    recommendationsEmptyState: "none",
    sections: [
        {
            key: "delivery_movement",
            title: "Delivery movement",
            metrics: [metric("wip_count", 7, "TEAM"), metric("review_latency", 31, "ORGANIZATION")],
            improved: [],
            worsened: [],
            changed: ["Served sentence"],
        },
    ],
} as unknown as OperatingReview;

const WEEK = "2026-09-28";

async function renderPage(team?: string | string[]) {
    return render(
        await OperatingReviewPage({
            searchParams: Promise.resolve({ week: WEEK, ...(team ? { team } : {}) }),
        }),
    );
}

const tiles = () => screen.getAllByTestId("operating-review-metric");

beforeEach(() => {
    fetchReview.mockReset();
    fetchReview.mockResolvedValue(served);
});
afterEach(cleanup);

describe("Operating Review for several teams", () => {
    it("sends ONE request with the team set as teamIds, and no teamId", async () => {
        await renderPage(["team-a", "team-b"]);
        expect(fetchReview).toHaveBeenCalledTimes(1);
        expect(fetchReview.mock.calls[0]).toEqual([
            "org-1",
            { teamIds: ["team-a", "team-b"], weekStart: WEEK },
        ]);
    });

    it("draws the served combined review as served: no web sum, no cap", async () => {
        // Only the team-set request gets the combined answer. A request for one team or for all
        // teams gets other numbers: a web aggregate of such answers would not draw 7 and 31.
        const other = {
            ...served,
            sections: [
                {
                    ...served.sections[0],
                    metrics: [metric("wip_count", 100, "TEAM"), metric("review_latency", 200)],
                    changed: ["Sentence of another answer"],
                },
            ],
            recommendations: ["Recommendation of another answer"],
        };
        fetchReview.mockImplementation(async (_orgId: string, input: { teamIds?: string[] }) =>
            input.teamIds ? served : other,
        );
        await renderPage(["team-a", "team-b"]);
        expect(tiles().map((tile) => within(tile).getByText(/Label/).textContent)).toEqual([
            "Label wip_count",
            "Label review_latency",
        ]);
        expect(tiles()[0]).toHaveTextContent("7");
        expect(tiles()[1]).toHaveTextContent("31");
        expect(screen.getByText("• Served sentence")).toBeInTheDocument();
        expect(screen.getByText("Served recommendation")).toBeInTheDocument();
    });

    it("is an error when that one request fails: no review of one of the teams in its place", async () => {
        fetchReview.mockRejectedValue(new Error("[GraphQL] failed"));
        await renderPage(["team-a", "team-b"]);
        expect(fetchReview).toHaveBeenCalledTimes(1);
        expect(screen.getByText("Could not load operating review")).toBeInTheDocument();
        expect(screen.queryAllByTestId("operating-review-metric")).toHaveLength(0);
    });

    it("sends one team as teamId and no team as teamId null, as before", async () => {
        await renderPage("team-a");
        expect(fetchReview.mock.calls).toEqual([["org-1", { teamId: "team-a", weekStart: WEEK }]]);
        cleanup();
        fetchReview.mockClear();
        await renderPage();
        expect(fetchReview.mock.calls).toEqual([["org-1", { teamId: null, weekStart: WEEK }]]);
    });
});

describe("Operating Review: the served scope of a metric", () => {
    const LABEL = "Whole organization";

    it("labels the whole-organization metrics when teams are selected, and no other", async () => {
        await renderPage(["team-a", "team-b"]);
        expect(tiles()[0]).not.toHaveTextContent(LABEL);
        expect(tiles()[1]).toHaveTextContent(LABEL);
        expect(screen.getByTestId("selected-teams-notice")).toHaveTextContent(
            "2 selected teams. Metrics marked “Whole organization” are not narrowed by the team filter.",
        );
    });

    it("labels them for one selected team too", async () => {
        await renderPage("team-a");
        expect(tiles()[1]).toHaveTextContent(LABEL);
        expect(tiles()[0]).not.toHaveTextContent(LABEL);
    });

    it("labels nothing when no team is selected", async () => {
        await renderPage();
        for (const tile of tiles()) expect(tile).not.toHaveTextContent(LABEL);
    });

    it("says nothing about whole-organization metrics when the answer has none", async () => {
        fetchReview.mockResolvedValue({
            ...served,
            sections: [{ ...served.sections[0], metrics: [metric("wip_count", 7, "TEAM")] }],
        });
        await renderPage(["team-a", "team-b"]);
        const notice = screen.getByTestId("selected-teams-notice");
        expect(notice).toHaveTextContent("2 selected teams");
        expect(notice).not.toHaveTextContent("Whole organization");
    });
});
