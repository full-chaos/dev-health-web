import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@/test/utils";
import { ContextStrip } from "./ContextStrip";
import type { MetricFilter } from "@/lib/filters/types";

function makeFilter(overrides?: Partial<MetricFilter["scope"]>): MetricFilter {
  return {
    scope: {
      level: "repo",
      ids: ["my-repo"],
      ...overrides,
    },
    time: {
      range_days: 30,
      compare_days: 0,
      start_date: undefined,
      end_date: undefined,
    },
    who: {},
    what: {},
    why: {},
    how: {},
  };
}

describe("ContextStrip", () => {
  it("renders scope and time labels", () => {
    render(<ContextStrip filters={makeFilter()} />);
    expect(screen.getByText(/repo/i)).toBeInTheDocument();
    expect(screen.getByText(/30 days/i)).toBeInTheDocument();
  });

  it("shows 'all' when no scope ids are provided", () => {
    render(<ContextStrip filters={makeFilter({ ids: [] })} />);
    expect(screen.getByText(/repo: all/i)).toBeInTheDocument();
  });

  it("joins multiple scope ids with commas", () => {
    render(<ContextStrip filters={makeFilter({ ids: ["repo-a", "repo-b"] })} />);
    expect(screen.getByText(/repo-a, repo-b/)).toBeInTheDocument();
  });

  it("renders the origin label when provided", () => {
    render(<ContextStrip filters={makeFilter()} origin="CHAOS-123" />);
    expect(screen.getByText("CHAOS-123")).toBeInTheDocument();
  });

  it("hides itself when the dismiss button is clicked", () => {
    render(<ContextStrip filters={makeFilter()} />);
    const dismissBtn = screen.getByRole("button");
    fireEvent.click(dismissBtn);
    expect(screen.queryByText(/repo: my-repo/)).not.toBeInTheDocument();
  });

  it("renders a date range when start and end dates are set", () => {
    const filter = makeFilter();
    filter.time = {
      range_days: 30,
      compare_days: 0,
      start_date: "2024-01-01",
      end_date: "2024-01-31",
    };
    render(<ContextStrip filters={filter} />);
    expect(screen.getByText(/2024-01-01 to 2024-01-31/)).toBeInTheDocument();
  });
});
