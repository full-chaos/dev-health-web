import { render, screen, waitFor } from "@/test/utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EvidencePanel } from "./EvidencePanel";
import type { MetricFilter } from "@/lib/filters/types";

const { mockGetExplainData, mockLoggerError } = vi.hoisted(() => ({
  mockGetExplainData: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock("@/lib/api/home", () => ({
  getExplainData: mockGetExplainData,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: mockLoggerError },
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

  it("uses the explain POST data path when an evidence URL points at explain", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
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
    });

    render(
      <EvidencePanel
        isOpen
        onCloseAction={() => undefined}
        title="Cycle Time"
        apiUrl="/api/v1/explain?metric=cycle_time"
        metric="cycle_time"
        filters={filters}
      />,
    );

    await waitFor(() => expect(screen.getByText("Shorten review queue")).toBeInTheDocument());
    expect(mockGetExplainData).toHaveBeenCalledWith({
      metric: "cycle_time",
      filters,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  afterEach(() => {
    mockGetExplainData.mockReset();
    mockLoggerError.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // CHAOS-2054 regression: a fetch failure must render a controlled,
  // customer-safe error state — never a mostly-blank panel with a raw red
  // error block.
  it("renders a customer-safe error state on fetch failure (not blank/raw)", async () => {
    mockGetExplainData.mockRejectedValue(new Error("API error: 500"));

    render(
      <EvidencePanel
        isOpen
        onCloseAction={() => undefined}
        title="Cycle Time"
        metric="cycle_time"
        filters={filters}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("evidence-error-state")).toBeInTheDocument());
    // Customer-safe copy from the controlled ErrorCard fallback.
    expect(screen.getByText("Unable to load this view")).toBeInTheDocument();
    expect(screen.getByText(/We couldn't load the supporting detail/i)).toBeInTheDocument();
  });

  it("hides raw failure detail unless evidence debug mode is enabled", async () => {
    mockGetExplainData.mockRejectedValue(new Error("API error: 500"));

    render(
      <EvidencePanel
        isOpen
        onCloseAction={() => undefined}
        title="Cycle Time"
        metric="cycle_time"
        filters={filters}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("evidence-error-state")).toBeInTheDocument());
    // Controlled copy still shown, but the raw impl detail is gated out.
    expect(screen.getByText("Unable to load this view")).toBeInTheDocument();
    expect(screen.queryByTestId("evidence-error-diagnostics")).not.toBeInTheDocument();
    expect(screen.queryByText(/API error: 500/)).not.toBeInTheDocument();
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it("shows and logs raw failure detail only in evidence debug mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEV_HEALTH_EVIDENCE_DEBUG", "true");
    mockGetExplainData.mockRejectedValue(new Error("API error: 500"));

    render(
      <EvidencePanel
        isOpen
        onCloseAction={() => undefined}
        title="Cycle Time"
        metric="cycle_time"
        filters={filters}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("evidence-error-state")).toBeInTheDocument());
    expect(screen.getByTestId("evidence-error-diagnostics")).toHaveTextContent("API error: 500");
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: "API error: 500",
        metric: "cycle_time",
        requestPath: "/api/v1/explain",
      }),
      "Evidence panel failed to load evidence data",
    );
  });

  // CHAOS-2054: an empty/undefined response renders a controlled empty state,
  // never a blank body.
  it("renders a controlled empty state when no data is returned", async () => {
    mockGetExplainData.mockResolvedValue(undefined);

    render(
      <EvidencePanel
        isOpen
        onCloseAction={() => undefined}
        title="Throughput"
        metric="throughput"
        filters={filters}
      />,
    );

    await waitFor(() => expect(screen.getByText("Nothing to show yet")).toBeInTheDocument());
  });
});
