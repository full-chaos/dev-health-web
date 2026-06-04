import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { ContextStrip } from "./ContextStrip";
import type { MetricFilter } from "@/lib/filters/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/work",
  useSearchParams: () => ({ toString: () => "" }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

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
  it("renders the unified global context bar", () => {
    render(<ContextStrip filters={makeFilter()} />);
    expect(screen.getByTestId("global-context-bar")).toBeInTheDocument();
    expect(screen.getByLabelText("Global context")).toBeInTheDocument();
  });

  it("surfaces the org, team, window, and repo controls", () => {
    render(<ContextStrip filters={makeFilter()} />);
    expect(screen.getByText("Org")).toBeInTheDocument();
    expect(screen.getByText("Team")).toBeInTheDocument();
    expect(screen.getByText("Window")).toBeInTheDocument();
    expect(screen.getByText("Repo")).toBeInTheDocument();
  });

  it("renders the origin label when provided", () => {
    render(<ContextStrip filters={makeFilter()} origin="CHAOS-123" />);
    expect(screen.getByText("CHAOS-123")).toBeInTheDocument();
  });
});
