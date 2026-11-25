import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, within } from "@/test/utils";

const cognitive = vi.hoisted(() => vi.fn());
const charts = vi.hoisted(() => ({
    calls: [] as Array<Array<{ day: string; value: number | null }>>,
}));

vi.mock("next/navigation", () => ({
    usePathname: () => "/cognitive-load",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div data-testid="scope-bar" /> }));
vi.mock("@/components/navigation/ViewSet", () => ({
    ViewSet: () => <div data-testid="view-set" />,
}));
vi.mock("@/components/work/HeatmapView", () => ({
    HeatmapView: () => <div data-testid="heatmap" />,
}));
vi.mock("@/components/charts/TimeseriesChart", () => ({
    TimeseriesChart: ({ data }: { data: Array<{ day: string; value: number | null }> }) => {
        charts.calls.push(data);
        return <div data-testid="timeseries" />;
    },
}));
vi.mock("@/components/charts/HorizontalBarChart", () => ({
    HorizontalBarChart: () => <div data-testid="bars" />,
}));
vi.mock("@/lib/api/visuals", () => ({ getHeatmap: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/auth", () => ({
    requireSession: vi.fn().mockResolvedValue({ user: { id: "u1", org_id: "org-1" } }),
}));
vi.mock("@/lib/graphql/cognitiveLoadFetchers", () => ({
    getCognitiveLoadViaGraphQL: (...args: unknown[]) => cognitive(...args),
}));

import CognitiveLoadPage from "./page";

const day = (d: string, pr: number, state: "MEASURED" | "NO_ROWS") => ({
    day: d,
    prInterruptionLoad: pr,
    contextSpreadCount: pr,
    reviewRequestLoad: pr,
    developerState: state,
    afterHoursCommitRatio: 0.18,
    weekendCommitRatio: 0.12,
});

async function renderTab(signals: ReturnType<typeof day>[], tab?: string) {
    cognitive.mockResolvedValue({ signals });
    const ui = await CognitiveLoadPage({ searchParams: Promise.resolve(tab ? { tab } : {}) });
    return render(ui as React.ReactElement);
}


beforeEach(() => {
    charts.calls.length = 0;
});

describe("Cognitive Load NO_ROWS days in the trends", () => {
    it("keeps a NO_ROWS day in the series as a null point (a gap), never 0 and never dropped", async () => {
        await renderTab(
            [
                day("2026-05-01", 10, "MEASURED"),
                day("2026-05-02", 0, "NO_ROWS"),
                day("2026-05-03", 12, "MEASURED"),
            ],
            "focus-pressure",
        );

        expect(charts.calls[0]).toEqual([
            { day: "2026-05-01", label: "05-01", value: 10 },
            { day: "2026-05-02", label: "05-02", value: null },
            { day: "2026-05-03", label: "05-03", value: 12 },
        ]);
    });

    it("plots a MEASURED day with value 0 as 0", async () => {
        await renderTab(
            [day("2026-05-01", 10, "MEASURED"), day("2026-05-02", 0, "MEASURED")],
            "focus-pressure",
        );

        expect(charts.calls[0].map((p) => p.value)).toEqual([10, 0]);
    });
});

describe("Cognitive Load tiles over MEASURED days only", () => {
    it("means the developer tiles over the measured days (null is not 0)", async () => {
        await renderTab([
            day("2026-05-01", 10, "MEASURED"),
            day("2026-05-02", 0, "NO_ROWS"),
            day("2026-05-03", 12, "MEASURED"),
        ]);

        const tiles = screen.getAllByTestId("cognitive-load-tile");
        expect(within(tiles[0]).getByText("11")).toBeInTheDocument();
    });
});

describe("Cognitive Load window where every day is NO_ROWS", () => {
    const allNoRows = () => [day("2026-05-01", 0, "NO_ROWS"), day("2026-05-02", 0, "NO_ROWS")];

    it("shows the tile no-data state (an em dash, N/A) for the three developer tiles, never 0", async () => {
        await renderTab(allNoRows());

        const tiles = screen.getAllByTestId("cognitive-load-tile");
        for (const tile of tiles.slice(0, 3)) {
            expect(within(tile).getByText("—")).toBeInTheDocument();
            expect(within(tile).getByText("N/A")).toBeInTheDocument();
        }
    });

    it("keeps the team ratio tiles (they have their own rows)", async () => {
        await renderTab(allNoRows());

        const tiles = screen.getAllByTestId("cognitive-load-tile");
        expect(within(tiles[3]).getByText("18%")).toBeInTheDocument();
        expect(within(tiles[4]).getByText("12%")).toBeInTheDocument();
    });

    it("shows the existing empty state on the Focus Pressure charts", async () => {
        await renderTab(allNoRows(), "focus-pressure");

        expect(screen.getByText("No interruption data")).toBeInTheDocument();
        expect(screen.getByText("No review-request data")).toBeInTheDocument();
    });

    it("shows the existing empty state on the Context Switching chart", async () => {
        await renderTab(allNoRows(), "context-switching");

        expect(screen.getByText("No context-spread data")).toBeInTheDocument();
    });

    it("shows the existing empty state on Load Drivers", async () => {
        await renderTab(allNoRows(), "load-drivers");

        expect(screen.getByText("No load-driver data")).toBeInTheDocument();
    });
});
