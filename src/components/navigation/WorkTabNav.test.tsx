import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { WorkTabNav } from "./WorkTabNav";
import type { MetricFilter } from "@/lib/filters/types";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/lib/filters/url", () => ({
  withFilterParam: (href: string) => href,
}));

const filters: MetricFilter = {
  scope: { level: "repo", ids: [] },
  time: { range_days: 30, start_date: undefined, end_date: undefined },
  developer: { ids: [] },
  repo: { ids: [] },
  work_type: { ids: [] },
  flow_stage: { ids: [] },
} as MetricFilter;

describe("WorkTabNav", () => {
  it("renders all tab labels", () => {
    render(<WorkTabNav activeTab="landscape" filters={filters} />);
    for (const label of ["Landscape", "Heatmap", "Flow", "Investment", "Capacity", "Flame", "Evidence", "Graph"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("marks the active tab with aria-current='page'", () => {
    render(<WorkTabNav activeTab="flow" filters={filters} />);
    const activeLink = screen.getByText("Flow").closest("a");
    expect(activeLink).toHaveAttribute("aria-current", "page");
  });

  it("does not mark inactive tabs with aria-current", () => {
    render(<WorkTabNav activeTab="flow" filters={filters} />);
    const inactiveLink = screen.getByText("Landscape").closest("a");
    expect(inactiveLink).not.toHaveAttribute("aria-current");
  });

  it("sets correct href for each tab", () => {
    render(<WorkTabNav activeTab="landscape" filters={filters} />);
    const flowLink = screen.getByText("Flow").closest("a");
    expect(flowLink).toHaveAttribute("href", "/work?tab=flow");
  });
});
