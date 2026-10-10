/**
 * CHAOS-9137: /explore never draws an explain answer that is for another metric. The REAL
 * explain fetcher runs; only the transport (`postJson`) is replaced, so the guard is exercised
 * through the real page. The route echoes the requested metric in `metric` and, for a metric it
 * does not know, answers with cycle_time's label and values.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, within } from "@/test/utils";

const { postJson } = vi.hoisted(() => ({ postJson: vi.fn() }));
vi.mock("@/lib/api/_shared", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/api/_shared")>()),
    postJson,
}));
vi.mock("@/components/evidence/EvidencePanel", () => ({ EvidencePanel: () => null }));
vi.mock("@/lib/admin/server", () => ({
    getCurrentOrg: async () => ({ data: { id: "o1", name: "Full Chaos" } }),
}));
vi.mock("@/components/charts/SparklineChart", () => ({ SparklineChart: () => null }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/explore",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => null }));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: async () => ({ ok: true }) }));

import Explore from "./page";

const renderExplore = async (params: Record<string, string>) =>
    render(await Explore({ searchParams: Promise.resolve(params) }));

/** What the route answers for a metric it does not know: cycle_time's config, the asked name. */
const cycleTimeAnswerFor = (metric: string) => ({
    metric,
    label: "Cycle Time",
    unit: "days",
    value: 4.2,
    delta_pct: -12,
    drivers: [{ id: "d1", label: "repo-alpha", value: 3, delta_pct: -20, evidence_link: "" }],
    contributors: [{ id: "c1", label: "repo-gamma", value: 7, delta_pct: 1, evidence_link: "" }],
    drilldown_links: {},
});

beforeEach(() => {
    postJson.mockReset();
});

describe("/explore with an explain answer for another metric (CHAOS-9137)", () => {
    it("a cycle_time answer to a pr_rework_ratio request draws the no-data state, never cycle_time's label or values", async () => {
        postJson.mockResolvedValue(cycleTimeAnswerFor("pr_rework_ratio"));
        await renderExplore({ metric: "pr_rework_ratio" });
        expect(postJson.mock.calls[0]?.[1]).toMatchObject({ metric: "pr_rework_ratio" });
        const header = within(screen.getByTestId("page-header"));
        expect(header.getByRole("heading", { level: 1 })).toHaveTextContent("PR Rework Ratio");
        expect(screen.queryByText(/Cycle Time/)).toBeNull();
        expect(screen.queryByText("repo-alpha")).toBeNull();
        expect(screen.queryByText("repo-gamma")).toBeNull();
        expect(screen.queryByText(/4\.2/)).toBeNull();
        expect(
            screen.getByText("Association detail will appear once data is ingested."),
        ).toBeInTheDocument();
    });

    it("a client error (400) for the metric draws the same no-data state, not a page error", async () => {
        postJson.mockImplementation(async () => {
            throw new Error("API error: 400");
        });
        await renderExplore({ metric: "pr_rework_ratio" });
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("PR Rework Ratio");
        expect(screen.queryByText(/Service unavailable/i)).toBeNull();
        expect(
            screen.getByText("Association detail will appear once data is ingested."),
        ).toBeInTheDocument();
    });

    it("an answer for the requested metric is drawn as before", async () => {
        postJson.mockResolvedValue(cycleTimeAnswerFor("cycle_time"));
        await renderExplore({ metric: "cycle_time" });
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Cycle Time");
        expect(screen.getByTestId("metric-value")).toHaveTextContent(/^4\.2 days$/);
        expect(screen.getByText("repo-alpha")).toBeInTheDocument();
    });
});
