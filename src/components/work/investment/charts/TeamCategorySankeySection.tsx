import { useCallback, useMemo } from "react";
import { SankeyChart } from "@/components/charts/SankeyChart";
import { formatNumber } from "@/lib/formatters";
import {
  isUnassignedLabel,
  stripSankeyPrefix,
  TOP_N_REPOS,
  UNASSIGNED_TEAM_LABEL,
} from "@/lib/investment";
import { computeSankeyMetrics, filterSankeyToTeam } from "@/lib/sankey";
import type { MetricFilter } from "@/lib/filters/types";
import type { SankeyNode, SankeyResponse } from "@/lib/types";

type PrepareSankeyFlow = (flow: SankeyResponse | null, topN: number) => SankeyResponse | null;

type BuildSankeyTooltipFormatter = (context: {
  nodeMap: Map<string, SankeyNode>;
  metrics: ReturnType<typeof computeSankeyMetrics> | null;
  baselineFlow?: SankeyResponse | null;
  baselineMetrics?: ReturnType<typeof computeSankeyMetrics> | null;
  timeRange: MetricFilter["time"];
  showBaselineDelta?: boolean;
}) => (params: unknown, unit: string) => string;

type TeamCategorySankeySectionProps = {
  filters: MetricFilter;
  focusedTeam: string | null;
  setFocusedTeam: (value: string | null) => void;
  selectedCategory: string | null;
  setSelectedCategory: (value: string | null | ((current: string | null) => string | null)) => void;
  setFocusSubcategory: (value: string | null) => void;
  showSubcategories: boolean;
  effortUnit: string;
  teamCategoryFlow: SankeyResponse | null | undefined;
  baselineSankeyFlow: SankeyResponse | null | undefined;
  isCategoryFlowLoading: boolean;
  prepareSankeyFlow: PrepareSankeyFlow;
  buildSankeyTooltipFormatter: BuildSankeyTooltipFormatter;
  resolveSubcategoryIdFromLabel: (label: string) => string | null;
};

export function TeamCategorySankeySection({
  filters,
  focusedTeam,
  setFocusedTeam,
  selectedCategory,
  setSelectedCategory,
  setFocusSubcategory,
  showSubcategories,
  effortUnit,
  teamCategoryFlow,
  baselineSankeyFlow,
  isCategoryFlowLoading,
  prepareSankeyFlow,
  buildSankeyTooltipFormatter,
  resolveSubcategoryIdFromLabel,
}: TeamCategorySankeySectionProps) {
  const rawSankeyFlow = useMemo(
    () => filterSankeyToTeam(teamCategoryFlow ?? null, focusedTeam),
    [teamCategoryFlow, focusedTeam],
  );
  const rawBaselineFlow = useMemo(
    () => filterSankeyToTeam(baselineSankeyFlow ?? null, focusedTeam),
    [baselineSankeyFlow, focusedTeam],
  );
  const sankeyFlow = useMemo(() => {
    if (!rawSankeyFlow) {
      return null;
    }
    return prepareSankeyFlow(
      { ...rawSankeyFlow, mode: teamCategoryFlow?.mode ?? "team_category_repo" } as SankeyResponse,
      TOP_N_REPOS,
    );
  }, [prepareSankeyFlow, rawSankeyFlow, teamCategoryFlow?.mode]);
  const baselineFlow = useMemo(() => {
    if (!rawBaselineFlow) {
      return null;
    }
    return prepareSankeyFlow(
      {
        ...rawBaselineFlow,
        mode: baselineSankeyFlow?.mode ?? "team_category_repo",
      } as SankeyResponse,
      TOP_N_REPOS,
    );
  }, [baselineSankeyFlow?.mode, prepareSankeyFlow, rawBaselineFlow]);
  const isSankeyLoading = isCategoryFlowLoading;

  const sankeyMetrics = useMemo(
    () => (sankeyFlow ? computeSankeyMetrics(sankeyFlow.nodes, sankeyFlow.links) : null),
    [sankeyFlow],
  );
  const baselineMetrics = useMemo(
    () => (baselineFlow ? computeSankeyMetrics(baselineFlow.nodes, baselineFlow.links) : null),
    [baselineFlow],
  );
  const baselineSankeyTotal = baselineMetrics?.totalFlow ?? 0;

  const sankeyNodeMap = useMemo(() => {
    const map = new Map<string, SankeyNode>();
    (sankeyFlow?.nodes ?? []).forEach((node) => {
      map.set(node.name, node);
    });
    return map;
  }, [sankeyFlow]);

  const showBaselineDelta = !selectedCategory && baselineSankeyTotal > 0;
  const sankeyCoverage = useMemo(() => {
    const coverage = sankeyFlow?.coverage;
    return {
      team: coverage?.team ?? sankeyFlow?.team_coverage ?? 0,
      repo: coverage?.repo ?? sankeyFlow?.repo_coverage ?? 0,
    };
  }, [sankeyFlow]);

  const categoryShareSummary = useMemo(() => {
    if (!sankeyFlow || !sankeyFlow.links.length) return [];
    const targetGroup = showSubcategories ? "subcategory" : "category";
    const groupNames = new Set(
      sankeyFlow.nodes.filter((node) => node.group === targetGroup).map((node) => node.name),
    );
    if (!groupNames.size) return [];
    const totals = new Map<string, number>();
    let total = 0;
    sankeyFlow.links.forEach((link) => {
      if (!groupNames.has(link.target)) return;
      totals.set(link.target, (totals.get(link.target) ?? 0) + link.value);
      total += link.value;
    });
    if (total === 0) {
      sankeyFlow.links.forEach((link) => {
        if (!groupNames.has(link.source)) return;
        totals.set(link.source, (totals.get(link.source) ?? 0) + link.value);
        total += link.value;
      });
    }
    return Array.from(totals.entries())
      .map(([name, value]) => ({
        name,
        value,
        share: total > 0 ? (value / total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [sankeyFlow, showSubcategories]);

  const isSingleTeamScope = filters.scope.level === "team" && filters.scope.ids.length === 1;
  const summaryLimit = showSubcategories ? 3 : isSingleTeamScope ? 1 : 3;
  const topCategorySummary = useMemo(
    () => categoryShareSummary.slice(0, summaryLimit),
    [categoryShareSummary, summaryLimit],
  );
  const topSummaryLabel = showSubcategories
    ? "Top subcategories:"
    : isSingleTeamScope
      ? "Top theme:"
      : "Top themes:";

  const handleTeamFocus = useCallback(
    (teamName: string) => {
      if (!teamName || teamName === UNASSIGNED_TEAM_LABEL) {
        return;
      }
      setSelectedCategory(null);
      setFocusSubcategory(null);
      setFocusedTeam(teamName);
    },
    [setFocusedTeam, setFocusSubcategory, setSelectedCategory],
  );

  const handleCategoryFocus = useCallback(
    (categoryName: string) => {
      if (!categoryName || isUnassignedLabel(categoryName)) {
        return;
      }
      setFocusSubcategory(null);
      setSelectedCategory((current) => (current === categoryName ? null : categoryName));
    },
    [setFocusSubcategory, setSelectedCategory],
  );

  const sankeyTooltipFormatter = useMemo(
    () =>
      buildSankeyTooltipFormatter({
        nodeMap: sankeyNodeMap,
        metrics: sankeyMetrics,
        baselineFlow,
        baselineMetrics,
        timeRange: filters.time,
        showBaselineDelta,
      }),
    [
      baselineFlow,
      baselineMetrics,
      buildSankeyTooltipFormatter,
      filters.time,
      sankeyMetrics,
      sankeyNodeMap,
      showBaselineDelta,
    ],
  );

  return (
    <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-(--font-display) text-lg">Team burden flow</h3>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-(--ink-muted)">
              <span>
                Team coverage:{" "}
                <strong className="text-(--ink)">{formatNumber(sankeyCoverage.team * 100)}%</strong>
              </span>
              <span>
                Repo coverage:{" "}
                <strong className="text-(--ink)">{formatNumber(sankeyCoverage.repo * 100)}%</strong>
              </span>
            </div>
          </div>
          <p className="mt-1 text-xs text-(--ink-muted)">
            {showSubcategories ? "Team to Theme to Subcategory to Repo" : "Team to Theme to Repo"}
          </p>
          {(focusedTeam || selectedCategory) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {focusedTeam && (
                <button
                  type="button"
                  onClick={() => setFocusedTeam(null)}
                  className="inline-flex items-center gap-2 rounded-full border border-(--card-stroke) px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)"
                >
                  Drilldown: Team = {focusedTeam}
                  <span className="text-xs">x</span>
                </button>
              )}
              {selectedCategory && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory(null);
                    setFocusSubcategory(null);
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-(--card-stroke) px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)"
                >
                  Drilldown: Theme = {selectedCategory}
                  <span className="text-xs">x</span>
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col items-start gap-2 text-xs text-(--ink-muted)">
          {selectedCategory && (
            <span>
              Theme focus: <strong className="text-(--ink)">{selectedCategory}</strong>
            </span>
          )}
          {topCategorySummary.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span>{topSummaryLabel}</span>
              {topCategorySummary.map((entry) => (
                <span
                  key={entry.name}
                  className="rounded-full border border-(--card-stroke) px-2 py-0.5 text-[10px]"
                >
                  {entry.name} {entry.share.toFixed(0)}%
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 mb-4 border-l-2 border-(--card-stroke) py-1 pl-3 text-[11px] leading-relaxed text-(--ink-muted)">
        This view shows where effort appears to land across teams, themes, and repos for the
        selected window. Allocation reflects attribution, not dependency or impact.
      </div>
      <div className="mt-0">
        {isSankeyLoading ? (
          <p className="text-sm text-(--ink-muted)">Loading flow data...</p>
        ) : !sankeyFlow || !sankeyFlow.links.length ? (
          <div className="flex h-[220px] items-center justify-center rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) text-center text-sm text-(--ink-muted)">
            No team burden flow available for this scope and window.
          </div>
        ) : (
          <SankeyChart
            nodes={sankeyFlow.nodes}
            links={sankeyFlow.links}
            unit={effortUnit}
            height={320}
            tooltipFormatter={sankeyTooltipFormatter}
            onItemClick={(item) => {
              if (!sankeyFlow) return;
              if (item.type === "node") {
                const node = sankeyFlow.nodes.find((n) => n.name === item.name);
                if (node?.group === "team") {
                  handleTeamFocus(stripSankeyPrefix(node.name));
                  return;
                }
                if (node?.group === "category") {
                  handleCategoryFocus(node.name);
                  return;
                }
                if (node?.group === "subcategory") {
                  const subId = resolveSubcategoryIdFromLabel(node.name);
                  if (subId) {
                    setFocusSubcategory(subId);
                  }
                }
              } else if (item.type === "link" && selectedCategory) {
                const subId = resolveSubcategoryIdFromLabel(item.source ?? "");
                if (subId) {
                  setFocusSubcategory(subId);
                }
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
