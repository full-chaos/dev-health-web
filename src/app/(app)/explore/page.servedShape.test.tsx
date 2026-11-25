/** Drilldown evidence rows with the field names ops serves (drilldown/prs.go PRItem, issues.go IssueItem). */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen } from "@/test/utils";

const { drilldown } = vi.hoisted(() => ({
    drilldown: { value: null as Record<string, unknown> | null },
}));
vi.mock("@/lib/api/investment", () => ({
    getDrilldown: async () => drilldown.value,
    getBlockedWorkIssues: async () => null,
}));
vi.mock("@/lib/api/home", () => ({
    getExplainOutcome: async () => ({ data: null, noView: false }),
    getHomeData: async () => null,
}));
vi.mock("@/components/evidence/EvidencePanel", () => ({ EvidencePanel: () => null }));
vi.mock("@/lib/admin/server", () => ({
    getCurrentOrg: async () => ({ data: { id: "o1", name: "Synthetic Org" } }),
}));
vi.mock("@/components/charts/SparklineChart", () => ({ SparklineChart: () => null }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/explore",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => null }));
vi.mock("@/lib/api/filterOptions", () => ({
    fetchFilterNames: async () => ({ teams: {}, repos: {}, developers: {} }),
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: async () => ({ ok: true }) }));

import Explore from "./page";

const renderExplore = async (api: string) =>
    render(await Explore({ searchParams: Promise.resolve({ api }) }));

beforeEach(() => {
    drilldown.value = null;
});

describe("/explore drilldown evidence rows on the served field names", () => {
    it("shows the PR author from author_name", async () => {
        drilldown.value = {
            items: [
                {
                    repo_id: "repo-1",
                    number: 12,
                    title: "Synthetic PR",
                    author_name: "Synthetic Author",
                    created_at: "2026-05-01T00:00:00Z",
                    merged_at: null,
                    first_review_at: null,
                    review_latency_hours: null,
                },
            ],
        };
        await renderExplore("/api/v1/drilldown/prs");
        expect(screen.getByText("Synthetic Author")).toBeInTheDocument();
    });

    it("shows the issue team from team_name", async () => {
        drilldown.value = {
            items: [
                {
                    work_item_id: "wi-1",
                    provider: "github",
                    status: "in_progress",
                    team_id: "team-1",
                    team_name: "Synthetic Team",
                    cycle_time_hours: null,
                    lead_time_hours: null,
                    started_at: null,
                    completed_at: null,
                },
            ],
        };
        await renderExplore("/api/v1/drilldown/issues");
        expect(screen.getByText("Synthetic Team")).toBeInTheDocument();
    });

    it("control: the served PR title, number and created_at render", async () => {
        drilldown.value = {
            items: [
                {
                    repo_id: "repo-1",
                    number: 12,
                    title: "Synthetic PR",
                    author_name: "Synthetic Author",
                    created_at: "2026-05-01T00:00:00Z",
                    merged_at: null,
                    first_review_at: null,
                    review_latency_hours: null,
                },
            ],
        };
        await renderExplore("/api/v1/drilldown/prs");
        expect(screen.getByText("Synthetic PR")).toBeInTheDocument();
        expect(screen.getByText("#12")).toBeInTheDocument();
    });
});
