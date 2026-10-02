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
        for (const [metric, value] of [
            ["change_failure_rate", "3%"],
            ["ci_success", "91%"],
            ["pr_rework_ratio", "12%"],
        ]) {
            expect(within(strip).getByTestId(`quality-tile-${metric}`)).toHaveTextContent(value);
        }
    });

    it("does not make a tile a link; the tile's Open evidence opens the shared drawer for its metric", async () => {
        await renderPage();
        const tile = screen.getByTestId("quality-tile-ci_success");
        expect(tile.closest("a")).toBeNull();
        expect(within(tile).queryByRole("link")).toBeNull();
        // The tile's short line stays.
        expect(tile).toHaveTextContent("Pipeline success");

        await userEvent.click(within(tile).getByRole("button", { name: "Open evidence" }));
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

    it("keeps the Open evidence head link of both association cards (Explore, change failure rate)", async () => {
        await renderPage();
        for (const id of ["quality-associations", "quality-contributors"]) {
            const card = screen.getByTestId(id);
            const link = within(card).getByRole("link", { name: "Open evidence" });
            expect(link.getAttribute("href")).toContain("/explore");
            expect(link.getAttribute("href")).toContain("change_failure_rate");
        }
        // The driver and contributor rows keep their own links.
        expect(
            within(screen.getByTestId("quality-associations")).getByText("atlas-api"),
        ).toBeInTheDocument();
        expect(
            within(screen.getByTestId("quality-contributors")).getByText("atlas-web"),
        ).toBeInTheDocument();
    });

    it("shows a missing value as '--' (placeholder mode), never 0", async () => {
        mockHome.mockResolvedValue({ deltas: [] });
        await renderPage();
        expect(screen.getByTestId("quality-tile-change_failure_rate")).toHaveTextContent("--");
    });
});
