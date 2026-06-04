import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@/test/utils";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter } from "@/lib/filters/encode";
import { GlobalContextBar } from "./GlobalContextBar";

const mockReplace = vi.fn();
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
  usePathname: () => "/work",
  useSearchParams: () => ({
    toString: () => currentSearchParams.toString(),
  }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

beforeEach(() => {
  mockReplace.mockClear();
  currentSearchParams = new URLSearchParams("role=em");
});

describe("GlobalContextBar", () => {
  it("renders org, team, window, and repo context", () => {
    render(<GlobalContextBar filters={defaultMetricFilter} />);

    expect(screen.getByLabelText("Global context")).toBeInTheDocument();
    expect(screen.getByText("Org")).toBeInTheDocument();
    expect(screen.getByText("Team")).toBeInTheDocument();
    expect(screen.getByText("Window")).toBeInTheDocument();
    expect(screen.getByText("Repo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "14d" })).toBeInTheDocument();
  });

  it("updates the shared filter param when a window changes", () => {
    render(<GlobalContextBar filters={defaultMetricFilter} />);

    fireEvent.click(screen.getByRole("button", { name: "30d" }));

    const nextUrl = mockReplace.mock.calls.at(-1)?.[0] as string;
    expect(nextUrl).toMatch(/^\/work\?/);
    expect(nextUrl).toContain("role=em");
    const encoded = new URL(nextUrl, "https://dev-health.test").searchParams.get("f");
    expect(decodeFilter(encoded).time.range_days).toBe(30);
  });
});
