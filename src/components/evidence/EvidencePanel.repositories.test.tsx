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
        ["https with a user name", "https://user@github.com/acme/api"],
        ["https with a user name and password", "https://user:secret@github.com/acme/api"],
        ["https with an empty user name and a password", "https://:secret@github.com/acme/api"],
    ])("no link for a served source_url that is %s", async (_name, value) => {
        await open({ source_url: value });
        expect(sourceLink()).toBeNull();
    });

    it("the footer keeps its one primary button", async () => {
        await open({ source_url: REPO_URL });
        expect(screen.getByRole("link", { name: "Open evidence" })).toBeInTheDocument();
    });
});

// Rule C (team-lead, CHAOS-8587): ops serves `repositories` from the same rows as `contributors`.
// A repository-stored metric draws them ONCE, under "Supporting repositories"; a metric with
// `repositories` null keeps "Supporting evidence" exactly as before.
describe("the same rows are not drawn twice", () => {
    const contributors = [
        {
            id: "r1",
            label: "acme/api",
            display_name: "acme/api",
            value: 1200,
            delta_pct: 4,
            evidence_link: "",
        },
        {
            id: "r2",
            label: "acme/web",
            display_name: "acme/web",
            value: 34,
            delta_pct: -2,
            evidence_link: "",
        },
    ];

    it("repositories served: each repository appears once, and no 'Supporting evidence' section", async () => {
        await open({
            contributors,
            repositories: [
                { id: "r1", name: "acme/api", value: 1200, source_url: null },
                { id: "r2", name: "acme/web", value: 34, source_url: null },
            ],
        });
        expect(screen.queryByTestId("evidence-supporting")).toBeNull();
        expect(screen.queryByText("Supporting evidence")).toBeNull();
        expect(screen.getAllByText("acme/api")).toHaveLength(1);
        expect(screen.getAllByText("acme/web")).toHaveLength(1);
        expect(screen.getAllByTestId("evidence-repository-row")).toHaveLength(2);
    });

    it("C1: driver rows stay with their served change; only the rows whose id is a repository are hidden", async () => {
        await open({
            drivers: [
                {
                    id: "d1",
                    label: "Review queue",
                    display_name: "Review queue",
                    value: 7,
                    delta_pct: 12,
                    evidence_link: "",
                },
            ],
            contributors,
            repositories: [
                { id: "r1", name: "acme/api", value: 1200, source_url: null },
                { id: "r2", name: "acme/web", value: 34, source_url: null },
            ],
        });
        const supporting = screen.getByTestId("evidence-supporting");
        const rows = within(supporting).getAllByTestId("evidence-supporting-row");
        expect(rows).toHaveLength(1);
        expect(rows[0]).toHaveTextContent("Review queue");
        expect(rows[0]).toHaveTextContent("+12%");
        expect(within(supporting).queryByText("acme/api")).toBeNull();
        expect(screen.getAllByText("acme/api")).toHaveLength(1);
    });

    it("a repository that is also a driver keeps its change row (a served change never vanishes) and still shows under Supporting repositories", async () => {
        await open({
            drivers: [
                {
                    id: "r1",
                    label: "acme/api",
                    display_name: "acme/api",
                    value: 1200,
                    delta_pct: 9,
                    evidence_link: "",
                },
            ],
            contributors,
            repositories: [
                { id: "r1", name: "acme/api", value: 1200, source_url: null },
                { id: "r2", name: "acme/web", value: 34, source_url: null },
            ],
        });
        const supporting = screen.getByTestId("evidence-supporting");
        const rows = within(supporting).getAllByTestId("evidence-supporting-row");
        expect(rows).toHaveLength(1);
        expect(rows[0]).toHaveTextContent("acme/api");
        expect(rows[0]).toHaveTextContent("+9%");
        // the contributor-only repository is drawn once
        expect(within(supporting).queryByText("acme/web")).toBeNull();
        expect(screen.getAllByText("acme/web")).toHaveLength(1);
        // the driver repository is in both places
        expect(
            within(screen.getByTestId("evidence-repositories")).getByText("acme/api"),
        ).toBeInTheDocument();
    });

    it("C1: a contributor that is NOT in repositories is kept", async () => {
        await open({
            contributors,
            repositories: [{ id: "r1", name: "acme/api", value: 1200, source_url: null }],
        });
        const rows = within(screen.getByTestId("evidence-supporting")).getAllByTestId(
            "evidence-supporting-row",
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]).toHaveTextContent("acme/web");
    });

    it("nothing served at all (empty drivers and contributors) with repositories []: the missing-data note stays", async () => {
        await open({ contributors: [], repositories: [] });
        expect(screen.queryByTestId("evidence-supporting")).toBeNull();
        expect(screen.getByText(/No contributing artifacts/u)).toBeInTheDocument();
        expect(screen.getByTestId("evidence-repositories")).toHaveTextContent("Not reported");
    });

    it("every served row is a repository: no 'Supporting evidence' section and NO missing-data note", async () => {
        await open({
            contributors,
            repositories: [
                { id: "r1", name: "acme/api", value: 1200, source_url: null },
                { id: "r2", name: "acme/web", value: 34, source_url: null },
            ],
        });
        expect(screen.queryByTestId("evidence-supporting")).toBeNull();
        expect(screen.queryByText(/No contributing artifacts/u)).toBeNull();
    });

    it("repositories null (a team-stored metric): 'Supporting evidence' is drawn as before", async () => {
        await open({ contributors, repositories: null });
        const supporting = screen.getByTestId("evidence-supporting");
        expect(within(supporting).getAllByTestId("evidence-supporting-row")).toHaveLength(2);
        expect(screen.queryByTestId("evidence-repositories")).toBeNull();
    });

    it("repositories absent (an older API): 'Supporting evidence' is drawn as before", async () => {
        await open({ contributors });
        expect(screen.getByTestId("evidence-supporting")).toBeInTheDocument();
    });

    it("the Artifacts fact still counts the served rows (the count is not the drawn list)", async () => {
        await open({
            contributors,
            repositories: [{ id: "r1", name: "acme/api", value: 1200, source_url: null }],
        });
        const artifacts = screen
            .getAllByTestId("evidence-fact")
            .find((row) => within(row).queryByText("Artifacts", { selector: "dt" }));
        expect(artifacts).toHaveTextContent("2 artifacts");
    });
});
