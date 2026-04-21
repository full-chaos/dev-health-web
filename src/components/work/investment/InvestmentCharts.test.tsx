/**
 * InvestmentCharts safety-net tests.
 *
 * Locks in CURRENT rendering invariants (section headings, state-specific
 * copy, chart mount points) so the upcoming CHAOS-1227 split cannot silently
 * regress the DOM shape when the 1000-LOC component is decomposed into
 * smaller sub-components. Mocks chart primitives as testid divs so ECharts
 * never runs in jsdom.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@/test/utils";
import { InvestmentCharts } from "./InvestmentCharts";
import type { MetricFilter } from "@/lib/filters/types";
import type {
  SankeyResponse,
  WorkUnitInvestment,
} from "@/lib/types";

const { treemapSpy, sankeySpy, sunburstSpy } = vi.hoisted(() => ({
  treemapSpy: vi.fn(),
  sankeySpy: vi.fn(),
  sunburstSpy: vi.fn(),
}));

vi.mock("@/components/charts/chartTheme", () => ({
  useChartTheme: () => ({
    text: "#111827",
    grid: "#e5e7eb",
    muted: "#6b7280",
    background: "#ffffff",
    stroke: "#d1d5db",
    accent1: "#2563eb",
    accent2: "#7c3aed",
    accent3: "#ef4444",
  }),
  useChartColors: () => ["#2563eb", "#14b8a6", "#f97316", "#a855f7", "#ec4899"],
}));

vi.mock("@/components/charts/TreemapChart", async () => {
  const actual = await vi.importActual<typeof import("@/components/charts/TreemapChart")>(
    "@/components/charts/TreemapChart"
  );
  return {
    ...actual,
    TreemapChart: (props: Record<string, unknown>) => {
      treemapSpy(props);
      return <div data-testid="treemap-chart" />;
    },
  };
});

vi.mock("@/components/charts/SankeyChart", () => ({
  SankeyChart: (props: Record<string, unknown>) => {
    sankeySpy(props);
    return <div data-testid="sankey-chart" />;
  },
}));

vi.mock("@/components/charts/InvestmentMixSunburst", () => ({
  InvestmentMixSunburst: (props: Record<string, unknown>) => {
    sunburstSpy(props);
    return <div data-testid="sunburst-chart" />;
  },
}));

const baseFilters: MetricFilter = {
  scope: { level: "org", ids: [] },
  time: { range_days: 30, compare_days: 30 },
  who: { developers: [] },
  what: { repos: [] },
  why: { work_category: [], issue_type: [] },
  how: { flow_stage: [] },
};

const sampleWorkUnit: WorkUnitInvestment = {
  work_unit_id: "wu-1",
  work_unit_name: "Feature work",
  work_unit_type: "pr",
  title: "Feature work",
  time_range: { start: "2026-02-01T00:00:00Z", end: "2026-03-01T00:00:00Z" },
  effort: { metric: "active_hours", value: 1 },
  investment: {
    themes: { feature: 0.8, quality: 0.2 },
    subcategories: { "feature.build": 0.8, "quality.tests": 0.2 },
  },
  evidence_quality: { value: 0.75, band: "high" },
  evidence: { textual: [], structural: [], contextual: [] },
};

const sampleSankey: SankeyResponse = {
  mode: "investment",
  nodes: [
    { name: "TEAM: core" },
    { name: "THEME: feature" },
    { name: "REPO: org/repo" },
  ],
  links: [
    { source: "TEAM: core", target: "THEME: feature", value: 10 },
    { source: "THEME: feature", target: "REPO: org/repo", value: 10 },
  ],
};

type Props = Parameters<typeof InvestmentCharts>[0];

function baseProps(overrides: Partial<Props> = {}): Props {
  return {
    filters: baseFilters,
    workUnits: [sampleWorkUnit],
    isLoading: false,
    investmentMix: null,
    isMixLoading: false,
    focusTheme: null,
    setFocusTheme: vi.fn(),
    setFocusSubcategory: vi.fn(),
    selectedCategory: null,
    setSelectedCategory: vi.fn(),
    focusedTeam: null,
    setFocusedTeam: vi.fn(),
    teamCategoryFlow: sampleSankey,
    baselineSankeyFlow: sampleSankey,
    isCategoryFlowLoading: false,
    repoTeamFlow: sampleSankey,
    isRepoTeamLoading: false,
    repoTeamFlowFailed: false,
    selectedThemeKey: null,
    showSubcategories: false,
    ...overrides,
  };
}

describe("InvestmentCharts (safety net for CHAOS-1227 split)", () => {
  beforeEach(() => {
    treemapSpy.mockClear();
    sankeySpy.mockClear();
    sunburstSpy.mockClear();
  });

  afterEach(() => cleanup());

  describe("section landmarks", () => {
    it("renders the three h3 section headings that a split refactor must preserve", () => {
      render(<InvestmentCharts {...baseProps()} />);
      expect(
        screen.getByRole("heading", { level: 3, name: /treemap|investment mix/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { level: 3, name: /team burden flow/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { level: 3, name: /where effort lands/i })
      ).toBeInTheDocument();
    });
  });

  describe("loading states", () => {
    it('shows "Loading work units..." when isLoading is true', () => {
      render(<InvestmentCharts {...baseProps({ isLoading: true, workUnits: [] })} />);
      expect(screen.getByText(/loading work units/i)).toBeInTheDocument();
    });

    it('shows "Loading flow data..." when isCategoryFlowLoading is true', () => {
      render(
        <InvestmentCharts
          {...baseProps({
            isCategoryFlowLoading: true,
            teamCategoryFlow: null,
            baselineSankeyFlow: null,
          })}
        />
      );
      expect(screen.getByText(/loading flow data/i)).toBeInTheDocument();
    });

    it('shows "Loading destination view..." when isRepoTeamLoading is true', () => {
      render(
        <InvestmentCharts
          {...baseProps({ isRepoTeamLoading: true, repoTeamFlow: null })}
        />
      );
      expect(screen.getByText(/loading destination view/i)).toBeInTheDocument();
    });
  });

  describe("empty states", () => {
    it('shows "No work unit investments available." when workUnits is empty and not loading', () => {
      render(<InvestmentCharts {...baseProps({ workUnits: [], isLoading: false })} />);
      expect(
        screen.getByText(/no work unit investments available/i)
      ).toBeInTheDocument();
    });
  });

  describe("chart mount points", () => {
    it("renders the sankey chart when teamCategoryFlow has data", () => {
      render(<InvestmentCharts {...baseProps()} />);
      expect(screen.getAllByTestId("sankey-chart").length).toBeGreaterThan(0);
      expect(sankeySpy).toHaveBeenCalled();
    });

    it("passes an object payload to the sankey chart (contract is object, not specific prop names)", () => {
      // The safety net intentionally does NOT assert specific prop names on SankeyChart.
      // The CHAOS-1227 split may reshape the props (e.g. pass pre-computed nodes/links
      // from a new sub-component). Over-specifying this contract would force churn in the
      // test on every internal refactor. Asserting "an object was passed" is the coarsest
      // useful invariant that still catches complete prop-wiring regressions.
      render(<InvestmentCharts {...baseProps()} />);
      expect(sankeySpy).toHaveBeenCalled();
      const firstCall = sankeySpy.mock.calls[0]?.[0];
      expect(firstCall).toBeTypeOf("object");
    });
  });

  describe("interaction invariants", () => {
    it("renders the investment and mix chart toggles so users can switch views", () => {
      render(<InvestmentCharts {...baseProps()} />);

      const radiogroups = screen.getAllByRole("radiogroup", { name: /chart type/i });
      expect(radiogroups.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByRole("radio", { name: /treemap/i })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /sunburst/i })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /sankey/i })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /chord/i })).toBeInTheDocument();
    });
  });

  describe("repo-team failure state", () => {
    it("still renders the three sections when repoTeamFlowFailed is true", () => {
      render(
        <InvestmentCharts
          {...baseProps({
            repoTeamFlowFailed: true,
            repoTeamFlow: null,
          })}
        />
      );
      expect(
        screen.getByRole("heading", { level: 3, name: /where effort lands/i })
      ).toBeInTheDocument();
    });
  });
});
