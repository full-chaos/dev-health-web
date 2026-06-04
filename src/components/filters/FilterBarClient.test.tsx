/**
 * FilterBarClient component tests — refactor safety net for CHAOS-1226.
 *
 * Locks in CURRENT behavior so the upcoming split refactor cannot silently
 * regress `resolveVisibility`, URL sync, reset, active-pill rendering, or
 * per-view rendering. Refs CHAOS-1239.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "@testing-library/react";
import { render, screen, fireEvent, cleanup } from "@/test/utils";
import { FilterBarClient, resolveVisibility, type FilterBarView } from "./FilterBarClient";
import { encodeFilterParam } from "@/lib/filters/encode";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import type { MetricFilter } from "@/lib/filters/types";

const mockReplace = vi.fn();
const mockPush = vi.fn();

let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/dashboard",
  useSearchParams: () => ({
    get: (key: string) => currentSearchParams.get(key),
    toString: () => currentSearchParams.toString(),
    has: (key: string) => currentSearchParams.has(key),
  }),
}));

vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    getJson: vi.fn().mockResolvedValue({
      teams: [],
      repos: [],
      services: [],
      developers: [],
      work_category: [],
      issue_type: [],
      flow_stage: [],
    }),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function setSearchParams(entries: Record<string, string> = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(entries)) sp.set(k, v);
  currentSearchParams = sp;
}

beforeEach(() => {
  mockReplace.mockClear();
  mockPush.mockClear();
  setSearchParams();
});

afterEach(() => {
  cleanup();
});

// Flushes useFilterBarState's `apiClient.getJson().then(setOptions)` effect
// inside an act() boundary so the async state update lands cleanly. Without
// this, the post-mount promise resolution fires outside act() and emits
// "An update to FilterBarClient inside a test was not wrapped in act(...)".
async function renderFB(ui: Parameters<typeof render>[0]) {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(ui);
  });
  return result;
}

describe("resolveVisibility (pure)", () => {
  it("returns DEFAULT visibility for unknown/undefined view", () => {
    const v = resolveVisibility(undefined);
    expect(v).toEqual({
      scope: true,
      repo: true,
      developer: true,
      workType: true,
      flowStage: false,
      date: true,
    });
  });

  it("returns METRICS_DEFAULT for view=metrics (no tab)", () => {
    const v = resolveVisibility("metrics");
    expect(v.repo).toBe(true);
    expect(v.developer).toBe(true);
    expect(v.flowStage).toBe(false);
    expect(v.workType).toBe(false);
  });

  it("returns METRICS_FLOW visibility for view=metrics tab=flow (developer + flowStage enabled)", () => {
    const v = resolveVisibility("metrics", "flow");
    expect(v.developer).toBe(true);
    expect(v.flowStage).toBe(true);
  });

  it("hides repo for view=work and view=investment (WORK_VISIBILITY)", () => {
    expect(resolveVisibility("work").repo).toBe(false);
    expect(resolveVisibility("work").workType).toBe(true);
    expect(resolveVisibility("investment").repo).toBe(false);
    expect(resolveVisibility("investment").workType).toBe(true);
  });

  it("hides scope for view=code (CODE_VISIBILITY)", () => {
    const v = resolveVisibility("code");
    expect(v.scope).toBe(false);
    expect(v.repo).toBe(true);
    expect(v.developer).toBe(true);
  });

  it("enables everything for view=explore (EXPLORE_VISIBILITY)", () => {
    const v = resolveVisibility("explore");
    expect(v.scope).toBe(true);
    expect(v.repo).toBe(true);
    expect(v.developer).toBe(true);
    expect(v.workType).toBe(true);
    expect(v.flowStage).toBe(true);
    expect(v.date).toBe(true);
  });

  it("hides ALL filters for view=security (managed externally)", () => {
    const v = resolveVisibility("security");
    expect(v.scope).toBe(false);
    expect(v.repo).toBe(false);
    expect(v.developer).toBe(false);
    expect(v.workType).toBe(false);
    expect(v.flowStage).toBe(false);
    expect(v.date).toBe(false);
  });

  it("keeps quality and testops global-only after the page FilterBar strips global fields", () => {
    expect(resolveVisibility("quality").developer).toBe(false);
    expect(resolveVisibility("testops").developer).toBe(false);
  });

  it("treats opportunities as WORK_VISIBILITY", () => {
    expect(resolveVisibility("opportunities")).toEqual(resolveVisibility("work"));
  });

  it("returns PEOPLE visibility (developer on, repo/workType off)", () => {
    const v = resolveVisibility("people");
    expect(v.developer).toBe(true);
    expect(v.repo).toBe(false);
    expect(v.workType).toBe(false);
  });
});

describe("URL sync on filter change", () => {
  it("calls router.replace with encoded `f` param when a date preset is clicked", async () => {
    // Seed URL with encoded default filter so the default-write init effect does not fire.
    setSearchParams({ f: encodeFilterParam(defaultMetricFilter) });

    await renderFB(<FilterBarClient view="home" />);

    fireEvent.click(screen.getByRole("button", { name: "30d" }));

    expect(mockReplace).toHaveBeenCalled();
    const firstCallArg = mockReplace.mock.calls[0][0] as string;
    expect(firstCallArg).toMatch(/^\/dashboard\?/);
    expect(firstCallArg).toContain("f=");
  });

  it("writes default `f` to URL when none is present (initialization effect)", async () => {
    setSearchParams({});
    await renderFB(<FilterBarClient view="home" />);

    expect(mockReplace).toHaveBeenCalled();
    const arg = mockReplace.mock.calls[0][0] as string;
    expect(arg).toContain("f=");
  });
});

describe("Reset", () => {
  it("calls router.replace with the default-encoded filter when Reset clicked", async () => {
    setSearchParams({ f: encodeFilterParam(defaultMetricFilter) });

    await renderFB(<FilterBarClient view="home" />);

    fireEvent.click(screen.getByRole("button", { name: /reset/i }));

    const lastArg = mockReplace.mock.calls.at(-1)?.[0] as string;
    expect(lastArg).toContain(`f=${encodeFilterParam(defaultMetricFilter)}`);
  });

  it("clears `q` search param on reset for view=people", async () => {
    setSearchParams({ f: encodeFilterParam(defaultMetricFilter), q: "alice" });

    await renderFB(<FilterBarClient view="people" />);

    fireEvent.click(screen.getByRole("button", { name: /reset/i }));

    const lastArg = mockReplace.mock.calls.at(-1)?.[0] as string;
    expect(lastArg).not.toContain("q=alice");
    expect(lastArg).toContain(`f=${encodeFilterParam(defaultMetricFilter)}`);
  });
});

describe("Active filter pills", () => {
  it("renders a FilterPill for each active repo/developer/work_category filter", async () => {
    const filtersWithSelections: MetricFilter = {
      ...defaultMetricFilter,
      who: { developers: ["alice"] },
      what: { repos: ["org/api"] },
      why: { work_category: ["feature"] },
    };
    setSearchParams({ f: encodeFilterParam(filtersWithSelections) });

    await renderFB(<FilterBarClient view="explore" />);

    expect(screen.getByText("org/api")).toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("feature")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /remove repo filter/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove dev filter/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove work filter/i })).toBeInTheDocument();
  });

  it("renders no pills when filter is the default (no selections)", async () => {
    setSearchParams({ f: encodeFilterParam(defaultMetricFilter) });
    await renderFB(<FilterBarClient view="explore" />);

    expect(screen.queryByRole("button", { name: /remove repo filter/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /remove dev filter/i })).toBeNull();
  });
});

describe("Per-view-type rendering smoke", () => {
  const views: FilterBarView[] = [
    "home",
    "metrics",
    "work",
    "investment",
    "people",
    "code",
    "quality",
    "opportunities",
    "explore",
    "landscape",
    "testops",
    "security",
    "feature-flags",
  ];

  it.each(views)("renders without error for view=%s", async (view) => {
    setSearchParams({ f: encodeFilterParam(defaultMetricFilter) });

    await renderFB(<FilterBarClient view={view} />);

    // Reset button is a cross-view invariant — always rendered regardless of visibility config.
    expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
  });

  it("shows search input for view=people only", async () => {
    setSearchParams({ f: encodeFilterParam(defaultMetricFilter) });
    await renderFB(<FilterBarClient view="people" />);
    expect(screen.getByPlaceholderText(/name or handle/i)).toBeInTheDocument();
  });

  it("hides the Filters (advanced) toggle on view=people", async () => {
    setSearchParams({ f: encodeFilterParam(defaultMetricFilter) });
    await renderFB(<FilterBarClient view="people" />);
    expect(screen.queryByRole("button", { name: /^filters$/i })).toBeNull();
  });
});
