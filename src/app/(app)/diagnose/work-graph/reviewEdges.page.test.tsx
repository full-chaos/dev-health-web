import { beforeEach, describe, expect, it, vi } from "vitest";
import { render as renderTree } from "@/test/utils";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import { encodeFilterParam } from "@/lib/filters/encode";
import type { MetricFilter } from "@/lib/filters/types";

// The work-graph page's review-edges fetch (CHAOS-2077): what it asks for and what it hands to
// the view. Calls the async server page as a function with the modules around it mocked.

const { fetchMock, graphViewProps } = vi.hoisted(() => ({
    fetchMock: vi.fn(),
    graphViewProps: vi.fn(),
}));

vi.mock("@/lib/graphql/reviewEdgesFetchers", () => ({ getReviewEdgesViaGraphQL: fetchMock }));
vi.mock("@/lib/auth", () => ({
    requireSession: async () => ({ user: { org_id: "org-1" } }),
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: async () => ({ ok: true }) }));
vi.mock("@/lib/config", () => ({ getServerEnv: () => ({ DEV_HEALTH_TEST_MODE: "true" }) }));
vi.mock("@/components/navigation/ViewSet", () => ({ ViewSet: () => null }));
vi.mock("@/components/shell/PageHeader", () => ({ PageHeader: () => null }));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => null }));
vi.mock("@/components/work/WorkGraphHeaderActions", () => ({ WorkGraphHeaderActions: () => null }));
vi.mock("@/components/work/GraphView", () => ({
    GraphView: (props: Record<string, unknown>) => {
        graphViewProps(props);
        return null;
    },
}));

import WorkGraphPage from "./page";

const filterWith = (patch: Partial<MetricFilter>): MetricFilter => ({
    ...defaultMetricFilter,
    time: {
        ...defaultMetricFilter.time,
        range_days: 30,
        start_date: "2026-09-01",
        end_date: "2026-09-30",
    },
    ...patch,
});

async function render(filters: MetricFilter, tab = "review-network") {
    renderTree(
        await WorkGraphPage({
            searchParams: Promise.resolve({ f: encodeFilterParam(filters), tab }),
        }),
    );
}

describe("work graph page: review edges", () => {
    beforeEach(() => {
        fetchMock.mockReset();
        graphViewProps.mockReset();
        fetchMock.mockResolvedValue({
            edges: [
                { reviewer: "a", author: "b", reviewsCount: 1, day: "2026-09-01", repoId: "r" },
            ],
            totalCount: 1,
        });
    });

    it("asks for the org, the window and no repo filter on an org scope", async () => {
        await render(filterWith({ scope: { level: "org", ids: ["org-1"] } }));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith({
            orgId: "org-1",
            sinceDate: "2026-09-01",
            untilDate: "2026-09-30",
            repoIds: null,
            teamIds: null,
        });
    });

    it("sends the filter's repos as repoIds", async () => {
        await render(filterWith({ what: { repos: ["repo-a"] } }));
        expect(fetchMock.mock.calls[0][0].repoIds).toEqual(["repo-a"]);
    });

    it("does not fetch on another tab", async () => {
        await render(filterWith({}), "overview");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("hands the edges to the view, and the fetch error text when it fails", async () => {
        await render(filterWith({}));
        expect(graphViewProps.mock.calls[0][0].reviewEdges).toHaveLength(1);
        expect(graphViewProps.mock.calls[0][0].reviewEdgesError).toBeNull();

        graphViewProps.mockReset();
        fetchMock.mockRejectedValue(new Error("boom"));
        await render(filterWith({}));
        expect(graphViewProps.mock.calls[0][0].reviewEdges).toBeNull();
        expect(graphViewProps.mock.calls[0][0].reviewEdgesError).toBe("boom");
    });

    it("sends a team scope's ids, in order and once each, as teamIds (CHAOS-7785)", async () => {
        await render(filterWith({ scope: { level: "team", ids: ["team-b", "team-a", "team-b"] } }));
        expect(fetchMock.mock.calls[0][0].teamIds).toEqual(["team-b", "team-a"]);
        expect(graphViewProps.mock.calls[0][0].reviewEdgesTeamScope).toBe(true);
    });

    it("sends teamIds together with repoIds when both are set", async () => {
        await render(
            filterWith({
                scope: { level: "team", ids: ["team-a"] },
                what: { repos: ["repo-a"] },
            }),
        );
        expect(fetchMock.mock.calls[0][0]).toMatchObject({
            repoIds: ["repo-a"],
            teamIds: ["team-a"],
        });
    });

    it.each(["org", "repo", "developer"] as const)(
        "sends no teamIds for a %s scope",
        async (level) => {
            await render(filterWith({ scope: { level, ids: ["x-1"] } }));
            expect(fetchMock.mock.calls[0][0].teamIds).toBeNull();
            expect(graphViewProps.mock.calls[0][0].reviewEdgesTeamScope).toBe(false);
        },
    );

    it("sends no teamIds for a team scope with no ids", async () => {
        await render(filterWith({ scope: { level: "team", ids: [] } }));
        expect(fetchMock.mock.calls[0][0].teamIds).toBeNull();
    });

    it("hands the server's totalCount to the view (null when nothing was fetched)", async () => {
        fetchMock.mockResolvedValue({ edges: [], totalCount: 1820 });
        await render(filterWith({}));
        expect(graphViewProps.mock.calls[0][0].reviewEdgesTotalCount).toBe(1820);

        graphViewProps.mockReset();
        await render(filterWith({}), "overview");
        expect(graphViewProps.mock.calls[0][0].reviewEdgesTotalCount).toBeNull();
    });
});
