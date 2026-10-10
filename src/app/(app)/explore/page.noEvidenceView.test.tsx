/**
 * /explore says "No evidence view for this metric yet." only when the metric has no explain
 * view: the answer is for another metric, or the route refuses it (400/404/422). A store or
 * network failure and an empty answer keep their own states. Runs the real `getExplainOutcome`
 * over a mocked transport.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen } from "@/test/utils";
import { apiErrorMessage } from "@/lib/constants/errors";

const post = vi.hoisted(() => ({
    answer: null as unknown,
    failure: null as Error | null,
}));
vi.mock("@/lib/api/_shared", async (orig) => ({
    ...(await orig<typeof import("@/lib/api/_shared")>()),
    postJson: (path: string, ...rest: unknown[]) =>
        path === "/api/v1/explain" && rest
            ? post.failure
                ? Promise.reject(post.failure)
                : Promise.resolve(post.answer)
            : Promise.resolve({}),
}));
vi.mock("@/components/evidence/EvidencePanel", () => ({ EvidencePanel: () => <div /> }));
vi.mock("@/lib/admin/server", () => ({ getCurrentOrg: async () => ({ data: undefined }) }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/explore",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div /> }));
vi.mock("@/components/charts/HorizontalBarChart", () => ({ HorizontalBarChart: () => <div /> }));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: async () => ({ ok: true }) }));
vi.mock("@/lib/api/filterOptions", () => ({
    fetchFilterNames: async () => ({ teams: {}, repos: {}, developers: {} }),
}));

import Explore from "./page";

const TEXT = "No evidence view for this metric yet.";
const CARDS = [
    "explore-metric-tile",
    "explore-signal-row",
    "association-cards",
    "evidence-shortcuts",
];
const expectNoCards = () => {
    for (const id of CARDS) expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.queryByText("Read the signal")).toBeNull();
    expect(screen.queryByText("Likely associations")).toBeNull();
    expect(screen.queryByText("Primary contributors")).toBeNull();
    expect(screen.queryByRole("button", { name: "View evidence" })).toBeNull();
    expect(screen.getByTestId("explore-context")).toBeInTheDocument();
    expect(screen.getByTestId("explore-return")).toBeInTheDocument();
};
const expectAllCards = () => {
    for (const id of CARDS) expect(screen.getByTestId(id)).toBeInTheDocument();
    expect(screen.getByText("Read the signal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View evidence" })).toBeInTheDocument();
};
const renderMetric = async (metric: string) =>
    render(await Explore({ searchParams: Promise.resolve({ metric }) }));

beforeEach(() => {
    post.answer = null;
    post.failure = null;
});

describe("/explore, metric with no explain view (CHAOS-9153)", () => {
    it("says so when the answer is for another metric", async () => {
        post.answer = {
            metric: "nope_metric",
            label: "Cycle Time",
            unit: "days",
            value: 4,
            drivers: [],
            contributors: [],
            drilldown_links: {},
        };
        await renderMetric("nope_metric");
        expect(screen.getByTestId("explore-no-evidence-view")).toHaveTextContent(TEXT);
        expectNoCards();
    });

    it.each([400, 404, 422])("says so when the route answers %i", async (status) => {
        post.failure = new Error(apiErrorMessage(status));
        await renderMetric("nope_metric");
        expect(screen.getByTestId("explore-no-evidence-view")).toHaveTextContent(TEXT);
        expectNoCards();
    });

    it("a 5xx keeps the failure state: no such text", async () => {
        post.failure = new Error(apiErrorMessage(503));
        await renderMetric("cycle_time");
        expect(screen.queryByText(TEXT)).toBeNull();
        expectAllCards();
    });

    it("an answer for the metric with no rows keeps the no-data state: no such text", async () => {
        post.answer = {
            metric: "cycle_time",
            label: "Cycle Time",
            unit: "days",
            value: 0,
            has_data: false,
            drivers: [],
            contributors: [],
            drilldown_links: {},
        };
        await renderMetric("cycle_time");
        expect(screen.queryByText(TEXT)).toBeNull();
        expectAllCards();
        expect(
            screen.getByText("Association detail will appear once data is ingested."),
        ).toBeInTheDocument();
    });
});
