import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { describe, expect, it, vi } from "vitest";

const checkApiHealthMock = vi.fn();
const getHomeDataMock = vi.fn();
const getExplainDataMock = vi.fn();
const getHeatmapMock = vi.fn();
const getQuadrantMock = vi.fn();
const getBusFactorDataMock = vi.fn();

vi.mock("@/components/shell/ScopeBar", () => ({
    ScopeBar: () => <div data-testid="scope-bar" />,
}));

vi.mock("@/components/metrics/MetricCard", () => ({
    MetricCard: ({ label, value }: { label: string; value?: number }) => (
        <section data-testid={`tile-${label}`} data-value={value === undefined ? "none" : value}>
            {label}
        </section>
    ),
}));

vi.mock("@/components/charts/HorizontalBarChart", () => ({
    HorizontalBarChart: () => <div data-testid="hotspot-bars" />,
}));

vi.mock("@/components/charts/HeatmapPanel", () => ({
    HeatmapPanel: () => <section data-testid="heatmap-panel" />,
}));

const timeseriesSpy = vi.fn();
vi.mock("@/components/charts/TimeseriesChart", () => ({
    TimeseriesChart: (props: unknown) => {
        timeseriesSpy(props);
        return <div data-testid="timeseries-chart" />;
    },
}));

vi.mock("@/components/charts/QuadrantPanel", () => ({
    QuadrantPanel: () => <section data-testid="quadrant-panel" />,
}));

vi.mock("@/lib/api/system", () => ({
    checkApiHealth: () => checkApiHealthMock(),
}));

vi.mock("@/lib/api/home", () => ({
    getExplainData: (...args: unknown[]) => getExplainDataMock(...args),
}));

vi.mock("@/lib/graphql/homeFetchers", () => ({
    getHomeDataViaGraphQL: (...args: unknown[]) => getHomeDataMock(...args),
}));

vi.mock("@/lib/api/visuals", () => ({
    getHeatmap: (...args: unknown[]) => getHeatmapMock(...args),
    getQuadrant: (...args: unknown[]) => getQuadrantMock(...args),
}));

vi.mock("@/lib/api/code", () => ({
    getBusFactorData: (...args: unknown[]) => getBusFactorDataMock(...args),
}));

import CodePage from "./page";

async function renderPage(params: Record<string, string> = {}) {
    const ui = await CodePage({ searchParams: Promise.resolve(params) });
    render(ui as React.ReactElement);
}

describe("CodePage", () => {
    it("renders Ownership concentration as meter rows from bus-factor evidence when Git blame data exists", async () => {
        checkApiHealthMock.mockResolvedValue({ ok: true });
        getHomeDataMock.mockResolvedValue({ deltas: [] });
        getExplainDataMock.mockResolvedValue({ contributors: [], unit: "loc" });
        getHeatmapMock.mockResolvedValue(null);
        getQuadrantMock.mockResolvedValue(null);
        getBusFactorDataMock.mockResolvedValue({
            orgId: "org-1",
            scope: {},
            value: 1,
            evidenceSampleCount: 3773,
            topMaintainers: [
                { author: "chrisgeo@users.noreply.github.com", sharePercent: 98.8 },
                { author: "49699333+dependabot[bot]@users.noreply.github.com", sharePercent: 1.2 },
            ],
            repos: [
                {
                    repoId: "repo-1",
                    repoName: "full-chaos/dev-health-ops",
                    value: 1,
                    evidenceSampleCount: 1947,
                    topMaintainers: [
                        { author: "chrisgeo@users.noreply.github.com", sharePercent: 99.9 },
                    ],
                },
            ],
        });

        await renderPage();

        const card = screen.getByTestId("ownership-patterns-card");
        expect(
            within(card).getByRole("heading", { name: "Ownership concentration" }),
        ).toBeInTheDocument();
        // Meter rows with the prototype's labels and the served shares; no author names or emails.
        const rows = within(card).getAllByTestId("meter-row");
        expect(rows.map((row) => row.textContent)).toEqual([
            "Primary maintainer98.8%",
            "Other contributor1.2%",
        ]);
        expect(card.textContent).not.toMatch(/chrisgeo|dependabot|@/);
        expect(
            within(card).queryByText(
                /connect a git provider with commit history to surface ownership/i,
            ),
        ).not.toBeInTheDocument();
    });

    it("brings the shared header and one scope bar, and no chrome of its own (shared app shell)", async () => {
        checkApiHealthMock.mockResolvedValue({ ok: true });
        getHomeDataMock.mockResolvedValue({ deltas: [] });
        getExplainDataMock.mockResolvedValue({ contributors: [], unit: "loc" });
        getHeatmapMock.mockResolvedValue(null);
        getQuadrantMock.mockResolvedValue(null);
        getBusFactorDataMock.mockResolvedValue(null);

        await renderPage();

        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("Churn and Ownership");
        const header = within(screen.getByTestId("page-header"));
        expect(
            header.getByText("Hotspots and ownership concentration in the selected window."),
        ).toBeInTheDocument();
        expect(header.queryByText("Open a card to investigate.")).toBeNull();
        expect(screen.getAllByTestId("scope-bar")).toHaveLength(1);
        // The shell owns these: the page has no main, no navigation and no way back of its own.
        expect(screen.queryByRole("main")).toBeNull();
        expect(screen.queryByRole("navigation")).toBeNull();
        expect(screen.queryByRole("link", { name: /Back to/ })).toBeNull();
    });

    it("no longer renders the Hotspot concentration heatmap or reads it (moved to Complexity > Hotspots)", async () => {
        checkApiHealthMock.mockResolvedValue({ ok: true });
        getHomeDataMock.mockResolvedValue({ deltas: [] });
        getExplainDataMock.mockResolvedValue({ contributors: [], unit: "loc" });
        getHeatmapMock.mockResolvedValue(null);
        getQuadrantMock.mockResolvedValue(null);
        getBusFactorDataMock.mockResolvedValue(null);

        await renderPage();

        expect(screen.queryByTestId("heatmap-panel")).toBeNull();
        expect(screen.queryByText("Hotspot concentration")).toBeNull();
        expect(getHeatmapMock).not.toHaveBeenCalled();
    });

    describe("ownership tiles and repository table (CHAOS-7616)", () => {
        const base = {
            orgId: "org-1",
            scope: {},
            topMaintainers: [],
            repos: [
                {
                    repoId: "r2",
                    repoName: "org/web",
                    value: 3,
                    evidenceSampleCount: 40,
                    topMaintainers: [],
                },
                {
                    repoId: "r1",
                    repoName: "org/ops",
                    value: 1,
                    evidenceSampleCount: 1947,
                    topMaintainers: [],
                },
            ],
        };
        const setup = (busFactor: unknown) => {
            checkApiHealthMock.mockResolvedValue({ ok: true });
            getHomeDataMock.mockResolvedValue({ deltas: [] });
            getExplainDataMock.mockResolvedValue({ contributors: [], unit: "loc" });
            getHeatmapMock.mockResolvedValue(null);
            getQuadrantMock.mockResolvedValue(null);
            getBusFactorDataMock.mockResolvedValue(busFactor);
        };

        it("shows the samples and the bus factor as tiles", async () => {
            setup({ ...base, value: 2, evidenceSampleCount: 3773 });
            await renderPage();
            expect(screen.getByTestId("tile-File-change samples")).toHaveAttribute(
                "data-value",
                "3773",
            );
            expect(screen.getByTestId("tile-Bus factor")).toHaveAttribute("data-value", "2");
        });

        it("shows no data as unavailable, not 0, when there is no result or no blame evidence", async () => {
            setup(null);
            await renderPage();
            expect(screen.getByTestId("tile-File-change samples")).toHaveAttribute(
                "data-value",
                "none",
            );
            expect(screen.getByTestId("tile-Bus factor")).toHaveAttribute("data-value", "none");
        });

        it("keeps a real zero sample count but not a bus factor without samples", async () => {
            setup({ ...base, value: 0, evidenceSampleCount: 0 });
            await renderPage();
            expect(screen.getByTestId("tile-File-change samples")).toHaveAttribute(
                "data-value",
                "0",
            );
            expect(screen.getByTestId("tile-Bus factor")).toHaveAttribute("data-value", "none");
        });

        it("lists repositories by lowest bus factor as Repository hotspots, Hotspot score 'Not reported' until served", async () => {
            setup({ ...base, value: 1, evidenceSampleCount: 3773 });
            await renderPage();
            const section = within(screen.getByTestId("code-repo-bus-factor"));
            expect(
                section.getByRole("heading", { level: 2, name: "Repository hotspots" }),
            ).toBeInTheDocument();
            const table = within(screen.getByTestId("code-repo-bus-factor-table"));
            expect(table.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
                "Repository",
                "Hotspot score",
                "Bus factor",
                "Churn",
                "File-change samples",
                "Evidence",
            ]);
            const rows = table.getAllByRole("row");
            // header + 2 rows, sorted by bus factor ascending
            expect(rows).toHaveLength(3);
            expect(rows[1]).toHaveTextContent("org/ops");
            expect(rows[1]).toHaveTextContent("1,947");
            expect(rows[2]).toHaveTextContent("org/web");
            for (const cell of screen.getAllByTestId("repo-hotspot-score")) {
                expect(cell).toHaveTextContent("Not reported");
            }
        });

        it("shows a served repository churn from the churn explain, and never puts it in the Hotspot score column", async () => {
            setup({ ...base, value: 1, evidenceSampleCount: 3773 });
            getExplainDataMock.mockResolvedValue({
                unit: "loc",
                contributors: [
                    { id: "r1", label: "org/ops", value: 67122, evidence_link: "/api/x" },
                ],
            });
            await renderPage();
            const churn = screen.getAllByTestId("repo-churn").map((c) => c.textContent);
            expect(churn[0]).toBe("67.1K");
            expect(churn[1]).toBe("Not reported");
            // The hotspot score is a different metric: not served per repository.
            for (const cell of screen.getAllByTestId("repo-hotspot-score")) {
                expect(cell).toHaveTextContent("Not reported");
            }
        });

        it("opens the shared drawer from a row's Evidence button with the repository's values", async () => {
            setup({ ...base, value: 1, evidenceSampleCount: 3773 });
            await renderPage();
            await userEvent.click(screen.getAllByTestId("repo-evidence-button")[0]);
            const facts = within(await screen.findByTestId("repo-evidence-facts"))
                .getAllByTestId("evidence-fact")
                .map((r) => [
                    r.querySelector("dt")?.textContent,
                    r.querySelector("dd")?.textContent,
                ]);
            expect(facts).toEqual([
                ["Repository", "org/ops"],
                ["Hotspot score", "Unknown"],
                ["Bus factor", "1"],
                ["Churn", "Unknown"],
                ["File-change samples", "1,947"],
                ["Maintainer", "Unknown"],
            ]);
        });

        it("keeps maintainer names as served ownership facts in the row drawer, and the served evidence link in its footer; no Hotspots card on the page", async () => {
            setup({
                ...base,
                value: 1,
                evidenceSampleCount: 3773,
                repos: [
                    {
                        repoId: "r1",
                        repoName: "org/ops",
                        value: 1,
                        evidenceSampleCount: 1947,
                        topMaintainers: [{ author: "ada", sharePercent: 99.9 }],
                    },
                ],
            });
            getExplainDataMock.mockResolvedValue({
                unit: "loc",
                contributors: [
                    {
                        id: "r1",
                        label: "org/ops",
                        value: 5,
                        evidence_link: "/api/v1/explain?metric=churn",
                    },
                ],
            });
            await renderPage();

            expect(screen.queryByTestId("code-hotspots-card")).toBeNull();
            await userEvent.click(screen.getByTestId("repo-evidence-button"));
            const facts = within(await screen.findByTestId("repo-evidence-facts"));
            expect(facts.getByText("ada · 99.9%")).toBeInTheDocument();
            expect(await screen.findByTestId("repo-evidence-link")).toHaveAttribute(
                "href",
                expect.stringContaining("explore"),
            );
            // The page itself shows no names.
            expect(screen.getByTestId("ownership-patterns-card").textContent).not.toContain("ada");
        });

        it("draws the three tiles as one strip", async () => {
            setup({ ...base, value: 1, evidenceSampleCount: 10 });
            await renderPage();
            expect(screen.getByTestId("code-tiles")).toHaveAttribute("data-columns", "3");
        });

        it("links to the three Complexity tabs with the arrow first and the filter on each", async () => {
            setup({ ...base, value: 1, evidenceSampleCount: 10 });
            await renderPage({ role: "eng" });
            const links = [
                ...within(screen.getByTestId("code-repo-bus-factor")).getAllByRole("link", {
                    name: "File-level hotspots",
                }),
                ...within(screen.getByTestId("code-complexity-links")).getAllByRole("link"),
            ];
            const want: Record<string, string> = {
                "File-level hotspots": "tab=hotspots",
                "Ownership risk": "tab=ownership-risk",
                "30-day file churn": "tab=churn",
            };
            expect(links.map((l) => l.textContent)).toEqual(Object.keys(want));
            for (const link of links) {
                expect(link.firstElementChild?.tagName.toLowerCase()).toBe("svg");
                const url = new URL(link.getAttribute("href") ?? "", "http://x");
                expect(url.pathname).toBe("/complexity");
                expect(url.search).toContain(want[link.textContent ?? ""]);
                expect(url.searchParams.get("f")).toBeTruthy();
                expect(url.searchParams.get("role")).toBe("eng");
            }
        });

        it("has a View evidence action with the tile values, shares and repositories as fact rows", async () => {
            setup({
                ...base,
                value: 2,
                evidenceSampleCount: 3773,
                topMaintainers: [{ author: "someone", sharePercent: 90 }],
            });
            await renderPage();
            await userEvent.click(
                within(screen.getByTestId("page-header")).getByRole("button", {
                    name: "View evidence",
                }),
            );
            const rows = within(await screen.findByTestId("page-evidence-facts"))
                .getAllByTestId("evidence-fact")
                .map((r) => [
                    r.querySelector("dt")?.textContent,
                    r.querySelector("dd")?.textContent,
                ]);
            expect(rows).toContainEqual(["File-change samples", "3,773"]);
            expect(rows).toContainEqual(["Bus factor", "2"]);
            expect(rows).toContainEqual(["Primary maintainer", "90%"]);
            expect(rows).toContainEqual(["org/ops", "Bus factor 1 · 1,947 samples"]);
            expect(JSON.stringify(rows)).not.toContain("someone");
        });
    });
});

// CHAOS-8105: the Churn trend is the served churn series of the page scope (`home.deltas[churn].spark`,
// one point per day). The web draws the served points; it adds, sums and fills nothing.
describe("CodePage churn trend", () => {
    const churn = (spark: Array<{ ts: string; value: number | null }>) => ({
        metric: "churn",
        label: "Code Churn",
        value: 1200,
        unit: "loc",
        delta_pct: 12,
        spark,
    });

    function serve(home: unknown) {
        vi.clearAllMocks();
        checkApiHealthMock.mockResolvedValue({ ok: true });
        if (home instanceof Error) getHomeDataMock.mockRejectedValue(home);
        else getHomeDataMock.mockResolvedValue(home);
        getExplainDataMock.mockResolvedValue({ contributors: [], unit: "loc" });
        getQuadrantMock.mockResolvedValue(null);
        getBusFactorDataMock.mockResolvedValue(null);
    }

    it("draws the served churn points, one per served day, with the date as the axis label", async () => {
        serve({
            deltas: [
                churn([
                    { ts: "2026-08-02T00:00:00", value: 39 },
                    { ts: "2026-08-01T00:00:00", value: 36 },
                    { ts: "2026-08-03T00:00:00", value: null },
                ]),
            ],
        });
        await renderPage();

        const card = screen.getByTestId("code-churn-trend");
        expect(
            within(card).getByRole("heading", { level: 2, name: "Churn trend" }),
        ).toBeInTheDocument();
        expect(card).toHaveTextContent(
            "Churn is a code-change signal, not an individual performance score.",
        );
        expect(within(card).getByTestId("timeseries-chart")).toBeInTheDocument();
        // The served points as they are: the full served stamp orders them, a null stays null.
        expect(timeseriesSpy.mock.calls.at(-1)?.[0]).toMatchObject({
            data: [
                { day: "2026-08-02T00:00:00", label: "2026-08-02", value: 39 },
                { day: "2026-08-01T00:00:00", label: "2026-08-01", value: 36 },
                { day: "2026-08-03T00:00:00", label: "2026-08-03", value: null },
            ],
            valueFormat: "number",
        });
    });

    it("puts the Churn trend beside Ownership concentration, trend first", async () => {
        serve({ deltas: [churn([{ ts: "2026-08-01T00:00:00", value: 36 }])] });
        await renderPage();

        const grid = screen.getByTestId("code-trend-ownership");
        const trend = within(grid).getByTestId("code-churn-trend");
        const ownership = within(grid).getByTestId("ownership-patterns-card");
        expect(
            Boolean(trend.compareDocumentPosition(ownership) & Node.DOCUMENT_POSITION_FOLLOWING),
        ).toBe(true);
        // After the tiles, before the repository table.
        const tiles = screen.getByTestId("code-tiles");
        const table = screen.getByTestId("code-repo-bus-factor");
        expect(
            Boolean(tiles.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING),
        ).toBe(true);
        expect(
            Boolean(grid.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING),
        ).toBe(true);
    });

    it.each([
        ["no delta is served", { deltas: [] }],
        [
            "the served deltas have no churn entry",
            {
                deltas: [
                    { ...churn([{ ts: "2026-08-01T00:00:00", value: 5 }]), metric: "cycle_time" },
                ],
            },
        ],
    ])(
        "reads 'Not reported' and draws no chart when %s (never the placeholder series)",
        async (_name, home) => {
            serve(home);
            await renderPage();

            const card = screen.getByTestId("code-churn-trend");
            expect(within(card).getByTestId("code-churn-trend-not-reported")).toHaveTextContent(
                "Not reported",
            );
            expect(within(card).queryByTestId("timeseries-chart")).toBeNull();
            expect(timeseriesSpy).not.toHaveBeenCalled();
        },
    );

    it.each([
        ["the served series is empty", []],
        [
            "every served point is null",
            [
                { ts: "2026-08-01T00:00:00", value: null },
                { ts: "2026-08-02T00:00:00", value: null },
            ],
        ],
    ])("reads 'No data for this window' and draws no chart when %s", async (_name, spark) => {
        serve({ deltas: [churn(spark)] });
        await renderPage();

        const card = screen.getByTestId("code-churn-trend");
        expect(within(card).getByTestId("code-churn-trend-empty")).toHaveTextContent(
            "No data for this window",
        );
        expect(within(card).queryByTestId("timeseries-chart")).toBeNull();
    });

    it("draws a served 0 as a point (0 is a value, not 'no data')", async () => {
        serve({ deltas: [churn([{ ts: "2026-08-01T00:00:00", value: 0 }])] });
        await renderPage();

        expect(
            within(screen.getByTestId("code-churn-trend")).getByTestId("timeseries-chart"),
        ).toBeInTheDocument();
    });

    it("reads 'Could not be read' when the read failed, and never the backend error text", async () => {
        serve(new Error("[GraphQL] home is served by query-api and has no Python implementation"));
        await renderPage();

        const card = screen.getByTestId("code-churn-trend");
        expect(within(card).getByTestId("code-churn-trend-failed")).toHaveTextContent(
            "Could not be read",
        );
        expect(card).not.toHaveTextContent(/GraphQL|query-api|Python/);
        expect(within(card).queryByTestId("timeseries-chart")).toBeNull();
        expect(within(card).queryByTestId("code-churn-trend-not-reported")).toBeNull();
    });
});
