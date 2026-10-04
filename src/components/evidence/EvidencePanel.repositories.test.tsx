import { render, screen, waitFor, within } from "@/test/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MetricFilter } from "@/lib/filters/types";

import { EvidencePanel } from "./EvidencePanel";

// CHAOS-8587 (web half of CHAOS-8103): the drawer shows "Supporting repositories" and
// "View original source" from the served explain fields `repositories` and `source_url`. Both are
// hidden when the field is null or absent; an empty list reads "Not reported"; the link is the
// served URL, byte for byte, never built here; the row field `source_url` is not drawn.

const { mockGetExplainData } = vi.hoisted(() => ({ mockGetExplainData: vi.fn() }));

vi.mock("@/lib/api/home", () => ({ getExplainData: mockGetExplainData }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/dashboard",
    useSearchParams: () => new URLSearchParams(),
}));

const filters = {
    scope: { level: "repo", ids: ["repo-1"] },
    time: { range_days: 90, compare_days: 90 },
    who: {},
    what: {},
    why: {},
    how: {},
} as MetricFilter;

const BASE = {
    metric: "churn",
    label: "Churn",
    unit: "lines",
    value: 120,
    delta_pct: 5,
    drivers: [],
    contributors: [],
    drilldown_links: {},
};

const REPO_URL = "https://github.com/acme/api";

const open = async (extra: Record<string, unknown>) => {
    mockGetExplainData.mockResolvedValue({ ...BASE, ...extra });
    render(
        <EvidencePanel
            isOpen
            onCloseAction={() => undefined}
            title="Churn appears up"
            metric="churn"
            filters={filters}
        />,
    );
    await waitFor(() => expect(screen.getByTestId("evidence-facts")).toBeInTheDocument());
};

const sourceLink = () => screen.queryByRole("link", { name: "View original source" });

beforeEach(() => {
    mockGetExplainData.mockReset();
});

describe("Supporting repositories", () => {
    it("draws one row per served repository: name left, value with the response unit right", async () => {
        await open({
            repositories: [
                { id: "r1", name: "acme/api", value: 1200, source_url: REPO_URL },
                { id: "r2", name: "acme/web", value: 34.5, source_url: null },
            ],
        });
        const section = screen.getByTestId("evidence-repositories");
        expect(
            within(section).getByRole("heading", { name: "Supporting repositories" }),
        ).toBeInTheDocument();
        const rows = within(section).getAllByTestId("evidence-repository-row");
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent("acme/api");
        expect(rows[0]).toHaveTextContent("1,200 lines");
        expect(rows[1]).toHaveTextContent("acme/web");
        expect(rows[1]).toHaveTextContent("34.5 lines");
    });

    it("the row's own source_url is not drawn as a link", async () => {
        await open({
            repositories: [{ id: "r1", name: "acme/api", value: 1, source_url: REPO_URL }],
        });
        expect(within(screen.getByTestId("evidence-repositories")).queryByRole("link")).toBeNull();
    });

    it("repositories null (a team-stored metric): no section at all", async () => {
        await open({ repositories: null });
        expect(screen.queryByTestId("evidence-repositories")).toBeNull();
        expect(screen.queryByText("Supporting repositories")).toBeNull();
    });

    it("repositories absent (an older answer): no section at all", async () => {
        await open({});
        expect(screen.queryByTestId("evidence-repositories")).toBeNull();
    });

    it("an empty list: the heading and 'Not reported'", async () => {
        await open({ repositories: [] });
        const section = screen.getByTestId("evidence-repositories");
        expect(within(section).getByText("Supporting repositories")).toBeInTheDocument();
        expect(section).toHaveTextContent("Not reported");
        expect(within(section).queryAllByTestId("evidence-repository-row")).toHaveLength(0);
    });

    it("a repository with no served name reads 'Not reported', never its id", async () => {
        await open({
            repositories: [
                {
                    id: "9f1c2d3e-aaaa-bbbb-cccc-1234567890ab",
                    name: null,
                    value: 7,
                    source_url: null,
                },
            ],
        });
        const row = screen.getByTestId("evidence-repository-row");
        expect(row).toHaveTextContent("Not reported");
        expect(row).toHaveTextContent("7 lines");
        expect(row).not.toHaveTextContent("9f1c2d3e");
    });

    it("a repository with a value that is not a number shows no made value", async () => {
        await open({
            repositories: [{ id: "r1", name: "acme/api", value: null, source_url: null }],
        });
        const row = screen.getByTestId("evidence-repository-row");
        expect(row).toHaveTextContent("acme/api");
        expect(row).toHaveTextContent("Not reported");
        expect(row).not.toHaveTextContent(/NaN|0 lines/u);
    });
});

describe("View original source", () => {
    it("links to the served URL byte for byte, in a new tab, with rel noopener", async () => {
        await open({ source_url: REPO_URL });
        const link = sourceLink();
        expect(link).not.toBeNull();
        expect(link).toHaveAttribute("href", REPO_URL);
        expect(link).toHaveAttribute("target", "_blank");
        expect(link?.getAttribute("rel")).toMatch(/noopener/u);
    });

    it("is shown without a repositories list (a team-stored metric at a one-repository scope)", async () => {
        await open({ repositories: null, source_url: REPO_URL });
        expect(sourceLink()).toHaveAttribute("href", REPO_URL);
        expect(screen.queryByTestId("evidence-repositories")).toBeNull();
    });

    it.each([
        ["null", null],
        ["absent", undefined],
        ["empty", ""],
        ["http (not https)", "http://github.com/acme/api"],
        ["relative", "/acme/api"],
        ["javascript:", "javascript:alert(1)"],
        ["no host", "https://"],
        ["not a URL", "acme/api"],
    ])("no link for a served source_url that is %s", async (_name, value) => {
        await open({ source_url: value });
        expect(sourceLink()).toBeNull();
    });

    it("the footer keeps its one primary button", async () => {
        await open({ source_url: REPO_URL });
        expect(screen.getByRole("link", { name: "Open evidence" })).toBeInTheDocument();
    });
});
