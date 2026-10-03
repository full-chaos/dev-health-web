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
        expect(header.getByText("Open a card to investigate.")).toBeInTheDocument();
        expect(screen.getAllByTestId("scope-bar")).toHaveLength(1);
        // The shell owns these: the page has no main, no navigation and no way back of its own.
        expect(screen.queryByRole("main")).toBeNull();
        expect(screen.queryByRole("navigation")).toBeNull();
        expect(screen.queryByRole("link", { name: /Back to/ })).toBeNull();
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
                ["Hotspot score", "Not reported"],
                ["Bus factor", "1"],
                ["Churn", "Not reported"],
                ["File-change samples", "1,947"],
            ]);
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
