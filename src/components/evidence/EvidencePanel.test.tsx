import { render, screen, waitFor } from "@/test/utils";
import { describe, expect, it, vi } from "vitest";

import { EvidencePanel } from "./EvidencePanel";
import type { MetricFilter } from "@/lib/filters/types";

const { mockGetExplainData } = vi.hoisted(() => ({
  mockGetExplainData: vi.fn(),
}));

vi.mock("@/lib/api/home", () => ({
  getExplainData: mockGetExplainData,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const filters = {
  scope: { level: "org", ids: ["org-1"] },
  time: { range_days: 30 },
  who: {},
  what: {},
  why: {},
  how: {},
} as MetricFilter;

describe("EvidencePanel", () => {
  it("renders provenance and contributing artifacts", async () => {
    mockGetExplainData.mockResolvedValue({
      metric: "cycle_time",
      label: "Cycle Time",
      value: 4,
      unit: "days",
      delta_pct: -12,
      summary: "Cycle time appears lower in this window.",
      evidence: [
        {
          id: "PR-1",
          title: "Shorten review queue",
          url: "/prs/PR-1",
          type: "pr",
          meta: "merged in 2d",
        },
      ],
      actions: [],
      provenance: {
        source: "workGraphEdges",
        quality: "high",
        last_sync: "2026-05-20T00:00:00Z",
        identity_confidence: 0.92,
      },
    });

    render(
      <EvidencePanel
        isOpen
        onCloseAction={() => undefined}
        title="Cycle Time"
        metric="cycle_time"
        filters={filters}
      />,
    );

    await waitFor(() => expect(screen.getByText("Quality + provenance")).toBeInTheDocument());
    expect(screen.getByText(/Source: workGraphEdges/i)).toBeInTheDocument();
    expect(screen.getByText(/Identity confidence: 92%/i)).toBeInTheDocument();
    expect(screen.getByText("Shorten review queue")).toBeInTheDocument();
  });

  it("makes empty evidence explicit as partial data", async () => {
    mockGetExplainData.mockResolvedValue({
      metric: "throughput",
      label: "Throughput",
      value: 0,
      unit: "items",
      delta_pct: 0,
      drivers: [],
      contributors: [],
      actions: [],
    });

    render(
      <EvidencePanel
        isOpen
        onCloseAction={() => undefined}
        title="Throughput"
        metric="throughput"
        filters={filters}
      />,
    );

    await waitFor(() => expect(screen.getByText(/Partial evidence/i)).toBeInTheDocument());
    expect(screen.getByText(/No contributing artifacts were returned/i)).toBeInTheDocument();
  });
});
