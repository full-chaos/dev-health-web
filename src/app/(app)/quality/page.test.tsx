/** Quality page on the shared parts: tiles in the metric strip with a drawer action, sections. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithEvidenceDrawer } from "@/test/evidenceDrawer";

const { mockHome, mockExplain, panelProps } = vi.hoisted(() => ({
    mockHome: vi.fn(),
    mockExplain: vi.fn(),
    panelProps: { last: null as Record<string, unknown> | null },
}));

vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...props
    }: {
        href: string;
        children: ReactNode;
        [key: string]: unknown;
    }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));
vi.mock("next/navigation", () => ({
    usePathname: () => "/quality",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/graphql/homeFetchers", () => ({ getHomeDataViaGraphQL: mockHome }));
vi.mock("@/lib/api/home", () => ({ getExplainData: mockExplain }));
vi.mock("@/components/shell/PageHeader", () => ({
    PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div data-testid="scope-bar" /> }));
vi.mock("@/components/charts/HorizontalBarChart", () => ({
    HorizontalBarChart: () => <div data-testid="horizontal-bar-chart" />,
}));
vi.mock("@/components/charts/SparklineChart", () => ({ SparklineChart: () => null }));
// The bars have their own tests (theme colors); here only their place matters.
vi.mock("@/components/quality/ReworkThemeBars", () => ({
    ReworkThemeBars: () => <div data-testid="rework-theme-bars" />,
}));
vi.mock("@/components/evidence/EvidencePanel", () => ({
    EvidencePanel: (props: Record<string, unknown>) => {
        panelProps.last = props;
        return <div data-testid="evidence-panel" />;
    },
}));

import QualityPage from "./page";

const delta = (metric: string, label: string, value: number) => ({
    metric,
    label,
    value,
    unit: "%",
    delta_pct: 4,
    spark: [],
});

const home = {
    deltas: [
        delta("change_failure_rate", "Change Failure Rate", 3),
        delta("ci_success", "CI Success Rate", 91),
        delta("pr_rework_ratio", "PR Rework Ratio", 12),
    ],
    rework_theme_allocation: [
        {
            theme: "feature_delivery",
            label: "Feature Delivery",
            allocation_pct: 40,
            prs_merged: 4,
            churn_loc: 1200,
        },
    ],
};

const explain = {
    unit: "%",
    drivers: [{ id: "repo-1", display_name: "atlas-api", delta_pct: 12, evidence_link: "/x" }],
    contributors: [{ id: "repo-2", display_name: "atlas-web", value: 3, evidence_link: "/y" }],
};

async function renderPage() {
    return renderWithEvidenceDrawer(
        await QualityPage({ searchParams: Promise.resolve({ role: "em" }) }),
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    panelProps.last = null;
    mockHome.mockResolvedValue(home);
    mockExplain.mockResolvedValue(explain);
});
afterEach(cleanup);

describe("Quality page — shared metric strip and sections", () => {
    it("draws the three tiles in one joined 3-column metric strip, with served values", async () => {
        await renderPage();
        const strip = screen.getByTestId("quality-tiles");
        expect(strip).toHaveAttribute("data-columns", "3");
        // The shared tile draws the number and its unit apart ("3 %").
        for (const [metric, value] of [
            ["change_failure_rate", "3 %"],
            ["ci_success", "91 %"],
            ["pr_rework_ratio", "12 %"],
        ]) {
            const tile = within(strip).getByTestId(`quality-tile-${metric}`);
            expect(within(tile).getByTestId("metric-value")).toHaveTextContent(value);
        }
    });

    it("does not make a tile a link; the tile's Open evidence opens the shared drawer for its metric", async () => {
        await renderPage();
        const tile = screen.getByTestId("quality-tile-ci_success");
        expect(tile.closest("a")).toBeNull();
        expect(within(tile).queryByRole("link")).toBeNull();
        // The tile's short line stays.
        expect(tile).toHaveTextContent("Pipeline success");

        await userEvent.click(
            within(tile).getByRole("button", { name: "CI Success Rate: Open evidence" }),
        );
        expect(await screen.findByTestId("evidence-panel")).toBeInTheDocument();
        expect(panelProps.last).toMatchObject({
            metric: "ci_success",
            title: "CI Success Rate",
            role: "em",
        });
    });

    it("draws Rework by Theme, Change Failure Associations and Contributors as section cards", async () => {
        await renderPage();
        for (const [id, title] of [
            ["quality-rework-by-theme", "Rework by Theme"],
            ["quality-associations", "Change Failure Associations"],
            ["quality-contributors", "Contributors"],
        ]) {
            const card = screen.getByTestId(id);
            expect(card.tagName).toBe("SECTION");
            expect(within(card).getByRole("heading", { level: 2 })).toHaveTextContent(title);
        }
    });

    it("draws associations and contributors as meter rows with the served values (prototype bars())", async () => {
        await renderPage();
        const associations = within(screen.getByTestId("quality-associations")).getByTestId(
            "association-meter-rows",
        );
        // Resolved name; the served signed percent change (the fill is |delta|).
        expect(
            within(associations)
                .getAllByTestId("meter-row")
                .map((r) => r.textContent),
        ).toEqual(["atlas-api+12%"]);
        const contributors = within(screen.getByTestId("quality-contributors")).getByTestId(
            "contributor-meter-rows",
        );
        // The served value with the served unit.
        expect(
            within(contributors)
                .getAllByTestId("meter-row")
                .map((r) => r.textContent),
        ).toEqual(["atlas-web3%"]);
        expect(screen.queryByTestId("horizontal-bar-chart")).toBeNull();
    });

    it("keeps unresolved contributors apart by number, never a raw id", async () => {
        mockExplain.mockResolvedValue({
            ...explain,
            contributors: [
                { id: "8dc7d5fc-1111-4222-8333-944455556666", value: 1, evidence_link: "/a" },
                { id: "5ba1b2cd-1111-4222-8333-944455556666", value: 2, evidence_link: "/b" },
            ],
        });
        await renderPage();
        const rows = within(screen.getByTestId("contributor-meter-rows")).getAllByTestId(
            "meter-row",
        );
        expect(rows.map((r) => r.textContent)).toEqual(["Unresolved 11%", "Unresolved 22%"]);
        expect(rows[0]).not.toHaveTextContent("8dc7d5fc-1111");
    });

    it("gives both cards an Evidence action that opens the shared drawer for change failure rate", async () => {
        await renderPage();
        for (const [id, section] of [
            ["quality-associations", "Change Failure Associations"],
            ["quality-contributors", "Contributors"],
        ]) {
            panelProps.last = null;
            await userEvent.click(
                within(screen.getByTestId(id)).getByRole("button", {
                    name: `Evidence: ${section}`,
                }),
            );
            expect(await screen.findByTestId("evidence-panel")).toBeInTheDocument();
            expect(panelProps.last).toMatchObject({ metric: "change_failure_rate", role: "em" });
        }
    });

    it("shows a missing value as 'Not reported' (placeholder mode), never 0", async () => {
        mockHome.mockResolvedValue({ deltas: [] });
        await renderPage();
        const tile = screen.getByTestId("quality-tile-change_failure_rate");
        expect(within(tile).getByTestId("metric-value")).toHaveTextContent("Not reported");
        expect(within(tile).getByTestId("metric-value")).not.toHaveTextContent("0");
    });
});
