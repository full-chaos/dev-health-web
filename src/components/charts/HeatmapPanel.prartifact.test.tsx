import { describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, within } from "@/test/utils";
import type { HeatmapResponse } from "@/lib/types";

import { HeatmapPanel } from "./HeatmapPanel";

// CHAOS-8834: the review-wait heatmap serves PR rows as {repo_id (uuid), number, title,
// created_at, first_review_at} (ops queryapi/heatmap ReviewWaitEvidenceItem). Invented data.

vi.mock("./HeatmapChart", () => ({ HeatmapChart: () => <div data-testid="heatmap-chart" /> }));
vi.mock("@/lib/api/visuals", () => ({ getHeatmap: vi.fn() }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/code",
    useSearchParams: () => new URLSearchParams(),
}));

const REPO = "3f2a9c1e-7b4d-4e8a-9c21-5d6e7f8a9b0c";

const grid = (evidence: HeatmapResponse["evidence"]): HeatmapResponse => ({
    axes: { x: ["Mon", "Tue"], y: ["9", "10"] },
    cells: [{ x: "Mon", y: "9", value: 3 }],
    legend: { unit: "hours", scale: "linear" },
    evidence,
});

const renderRows = (evidence: HeatmapResponse["evidence"]) => {
    render(
        <HeatmapPanel
            title="Review wait"
            description="d"
            request={{
                type: "temporal_load",
                metric: "review_wait_density",
                scope_type: "org",
                range_days: 90,
            }}
            initialData={grid(evidence)}
        />,
    );
    return screen.getAllByRole("link");
};

describe("HeatmapPanel PR artifact rows", () => {
    it("names a PR row by its served title and says what the link opens", () => {
        const [row] = renderRows([
            {
                repo_id: REPO,
                number: 42,
                title: "Cap retry backoff",
                created_at: "2026-09-01T09:10:00Z",
                first_review_at: "2026-09-01T12:00:00Z",
            },
        ]);
        expect(within(row).getByText(/Cap retry backoff/)).toBeInTheDocument();
        expect(within(row).getByText(/#42/)).toBeInTheDocument();
        expect(row).toHaveTextContent("Open pull request");
        expect(row).not.toHaveTextContent("flame");
        expect(row).not.toHaveTextContent("#3f2a9c1e");
    });

    it("a PR row without a served title says the title is not reported, never an id token", () => {
        const [row] = renderRows([{ repo_id: REPO, number: 7, title: null }]);
        expect(row).toHaveTextContent("Title not reported");
        expect(row).toHaveTextContent("#7");
        expect(row).not.toHaveTextContent("3f2a9c1e");
        expect(row).toHaveTextContent("Open pull request");
    });

    it("shows the served repository name on a PR row", () => {
        const [row] = renderRows([
            { repo_id: REPO, repo_name: "acme/billing", number: 42, title: "Cap retry backoff" },
        ]);
        expect(row).toHaveTextContent("acme/billing");
        expect(row).toHaveTextContent("Cap retry backoff");
        expect(row).not.toHaveTextContent("3f2a9c1e");
    });

    it("a PR row with no repository name says so, never the id", () => {
        const [row] = renderRows([
            { repo_id: REPO, repo_name: null, number: 42, title: "Cap retry backoff" },
        ]);
        expect(row).toHaveTextContent("Repository not reported");
        expect(row).not.toHaveTextContent("3f2a9c1e");
    });
});
