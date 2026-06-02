import { render, screen } from "@/test/utils";
import { describe, expect, it, vi } from "vitest";

import { HeatmapPanel } from "./HeatmapPanel";
import type { HeatmapResponse } from "@/lib/types";

// Stub the echarts-backed chart so the panel renders in jsdom without echarts.
vi.mock("./HeatmapChart", () => ({
  HeatmapChart: () => <div data-testid="heatmap-chart" />,
}));

vi.mock("@/lib/api/visuals", () => ({
  getHeatmap: vi.fn(),
}));

const request = {
  type: "risk" as const,
  metric: "hotspot_risk",
  scope_type: "org",
  range_days: 30,
};

const baseResponse = (cells: HeatmapResponse["cells"]): HeatmapResponse => ({
  axes: { x: ["Mon", "Tue"], y: ["auth", "billing"] },
  cells,
  legend: { unit: "risk", scale: "linear" },
  evidence: [],
});

const UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("HeatmapPanel — hotspot evidence contract (CHAOS-2035)", () => {
  it("shows an explicit flat-data state instead of a uniform grid", () => {
    const data = baseResponse([
      { x: "Mon", y: "auth", value: 5 },
      { x: "Tue", y: "billing", value: 5 },
    ]);

    render(
      <HeatmapPanel
        title="Hotspot concentration"
        description="Where churn accumulates."
        request={request}
        initialData={data}
        flatStateLabel="No hotspot variance in this window"
      />,
    );

    expect(screen.getByTestId("heatmap-flat-state")).toHaveTextContent(
      "No hotspot variance in this window",
    );
    expect(screen.queryByTestId("heatmap-chart")).not.toBeInTheDocument();
  });

  it("renders a default summary and human-readable typed artifacts — never raw paths/UUIDs/JSON", () => {
    const data: HeatmapResponse = {
      ...baseResponse([
        { x: "Mon", y: "auth", value: 1 },
        { x: "Tue", y: "billing", value: 9 },
      ]),
      evidence: [
        {
          path: "src/services/auth/login.ts",
          value: 12,
          ts: "2026-05-01T00:00:00Z",
        },
        { work_item_id: UUID },
      ],
    };

    render(
      <HeatmapPanel
        title="Hotspot concentration"
        description="Where churn accumulates."
        request={request}
        initialData={data}
        evidenceTitle="Hotspot evidence"
        defaultSummary="Leading hotspots: Auth Service. Higher values lean toward concentrated change."
      />,
    );

    // Variance present → the chart renders (not the flat state).
    expect(screen.getByTestId("heatmap-chart")).toBeInTheDocument();
    expect(screen.queryByTestId("heatmap-flat-state")).not.toBeInTheDocument();

    // Default summary is shown before any cell is selected.
    expect(screen.getByText(/Leading hotspots: Auth Service/)).toBeInTheDocument();

    // File artifact: render-safe basename, full path only in the tooltip.
    const fileLabel = screen.getByText("login.ts");
    expect(fileLabel).toHaveAttribute("title", "src/services/auth/login.ts");
    expect(screen.queryByText("src/services/auth/login.ts")).not.toBeInTheDocument();

    // UUID work item degrades to a stable short label — never the bare UUID.
    expect(screen.getByText("#550e8400")).toBeInTheDocument();
    expect(screen.queryByText(UUID)).not.toBeInTheDocument();

    // No raw JSON dump of the evidence object.
    expect(screen.queryByText(/work_item_id/)).not.toBeInTheDocument();
  });
});
