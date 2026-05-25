// @vitest-environment jsdom

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MetricFilter } from "@/lib/filters/types";
import type { QuadrantResponse } from "@/lib/types";
import { QuadrantPanel } from "@/components/charts/QuadrantPanel";

const trackEvent = vi.fn();

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href }, children),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/charts/QuadrantChart", () => ({
  QuadrantChart: ({ data, onPointSelect }: { data: QuadrantResponse; onPointSelect: (point: QuadrantResponse["points"][number]) => void }) =>
    React.createElement(
      "button",
      { type: "button", onClick: () => onPointSelect(data.points[0]), "data-testid": "quadrant-chart" },
      "select point",
    ),
}));

vi.mock("@/lib/telemetry/useTrackEvent", () => ({
  useTrackEvent: () => trackEvent,
}));

describe("QuadrantPanel", () => {
  it("isolates individual scope to a single identity in the DOM", () => {
    const data: QuadrantResponse = {
      axes: {
        x: { metric: "churn", label: "Churn", unit: "%" },
        y: { metric: "throughput", label: "Throughput", unit: "items" },
      },
      points: [
        {
          entity_id: "person-1",
          entity_label: "Liam",
          x: 10,
          y: 20,
          window_start: "2024-01-01",
          window_end: "2024-01-07",
          evidence_link: "/api/v1/explain?metric=throughput",
        },
        {
          entity_id: "person-2",
          entity_label: "Noah",
          x: 18,
          y: 14,
          window_start: "2024-01-01",
          window_end: "2024-01-07",
          evidence_link: "/api/v1/explain?metric=throughput",
        },
      ],
      annotations: [],
    };
    const filters: MetricFilter = {
      time: { range_days: 7, compare_days: 7 },
      scope: { level: "developer", ids: ["person-1"] },
      who: {},
      what: {},
      why: {},
      how: {},
    };

    const html = renderToStaticMarkup(
      React.createElement(QuadrantPanel, {
        title: "Churn × Throughput landscape",
        description: "Individual quadrant view.",
        data,
        filters,
      }),
    );

    expect(html.match(/Liam/g) ?? []).toHaveLength(1);
    expect(html).not.toContain("Noah");
  });

  it("tracks point selection and guide open with typed chart events", () => {
    trackEvent.mockClear();
    const data: QuadrantResponse = {
      axes: {
        x: { metric: "churn", label: "Churn", unit: "%" },
        y: { metric: "throughput", label: "Throughput", unit: "items" },
      },
      points: [
        {
          entity_id: "team-1",
          entity_label: "Team One",
          x: 10,
          y: 20,
          window_start: "2024-01-01",
          window_end: "2024-01-07",
          evidence_link: "/api/v1/explain?metric=throughput",
        },
      ],
      annotations: [],
    };
    const filters: MetricFilter = {
      time: { range_days: 7, compare_days: 7 },
      scope: { level: "team", ids: ["team-1"] },
      who: {},
      what: {},
      why: {},
      how: {},
    };

    render(
      React.createElement(QuadrantPanel, {
        title: "Churn × Throughput landscape",
        description: "Team quadrant view.",
        data,
        filters,
      }),
    );

    fireEvent.click(screen.getByTestId("quadrant-chart"));
    expect(trackEvent).toHaveBeenCalledWith("chart_interacted", {
      chart: "quadrant",
      action: "point_selected",
      surface: "quadrant_panel",
      scope: "team",
    });

    fireEvent.click(screen.getByRole("button", { name: /view guide/i }));
    expect(trackEvent).toHaveBeenCalledWith("guide_opened", {
      guide: "quadrant_interpretation",
      surface: "quadrant_panel",
    });
  });
});
