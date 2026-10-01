import { useCallback, useMemo } from "react";
import { SankeyChart } from "@/components/charts/SankeyChart";
import { formatNumber } from "@/lib/formatters";
import {
    COVERAGE_UNAVAILABLE_REASON,
    isUnassignedLabel,
    readFlowCoverage,
    stripSankeyPrefix,
    TOP_N_REPOS,
    UNASSIGNED_TEAM_LABEL,
} from "@/lib/investment";
import { computeSankeyMetrics, filterSankeyToTeam } from "@/lib/sankey";
import {
    computeSelectedPath,
    filterSankeyToEntity,
    findClickedNode,
    type SelectedEntity,
} from "@/lib/allocationSelection";
import { SelectedPathPanel } from "./SelectedPathPanel";
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

export type TeamCategorySankeySectionProps = {
    filters: MetricFilter;
    focusedTeam: string | null;
    setFocusedTeam: (value: string | null) => void;
    selectedCategory: string | null;
    setSelectedCategory: (
        value: string | null | ((current: string | null) => string | null),
    ) => void;
    setFocusSubcategory: (value: string | null) => void;
    showSubcategories: boolean;
    effortUnit: string;
    teamCategoryFlow: SankeyResponse | null | undefined;
    baselineSankeyFlow: SankeyResponse | null | undefined;
    isCategoryFlowLoading: boolean;
    prepareSankeyFlow: PrepareSankeyFlow;
    buildSankeyTooltipFormatter: BuildSankeyTooltipFormatter;
    resolveSubcategoryIdFromLabel: (label: string) => string | null;
    /** Subcategory / repo selection (new): filters the chart to that entity. Team and theme
     * keep their production drill (focusedTeam / selectedCategory). */
    selectedEntity?: SelectedEntity | null;
    onSelectEntity?: (entity: SelectedEntity | null) => void;
};

const KIND_CHIP_LABEL = { team: "Team", theme: "Theme", subcategory: "Subcategory", repo: "Repo" };

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
    selectedEntity = null,
    onSelectEntity = () => {},
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
            {
                ...rawSankeyFlow,
                mode: teamCategoryFlow?.mode ?? "team_category_repo",
            } as SankeyResponse,
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

    // The flow before any team focus: the base for a TEAM selection's share.
    const unfilteredFlow = useMemo(
        () =>
            teamCategoryFlow
                ? prepareSankeyFlow(
                      {
                          ...teamCategoryFlow,
                          mode: teamCategoryFlow.mode ?? "team_category_repo",
                      } as SankeyResponse,
                      TOP_N_REPOS,
                  )
                : null,
        [prepareSankeyFlow, teamCategoryFlow],
    );
    const unfilteredBaseline = useMemo(
        () =>
            baselineSankeyFlow
                ? prepareSankeyFlow(
                      {
                          ...baselineSankeyFlow,
                          mode: baselineSankeyFlow.mode ?? "team_category_repo",
                      } as SankeyResponse,
                      TOP_N_REPOS,
                  )
                : null,
        [prepareSankeyFlow, baselineSankeyFlow],
    );
    // What the chart draws: the flow cut to the selected subcategory / repo, if any.
    const chartFlow = useMemo(
        () => (selectedEntity ? filterSankeyToEntity(sankeyFlow, selectedEntity.name) : sankeyFlow),
        [sankeyFlow, selectedEntity],
    );

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
    // Missing is not zero: a leaf the backend did not produce stays null and
    // renders as "unavailable"; a produced 0 renders as 0%.
    const sankeyCoverage = useMemo(() => readFlowCoverage(sankeyFlow), [sankeyFlow]);
    const coverageUnavailable = sankeyCoverage.team === null || sankeyCoverage.repo === null;
    const formatCoverage = (value: number | null) =>
        value === null ? "unavailable" : `${formatNumber(value * 100)}%`;

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
            onSelectEntity(null);
            setFocusedTeam(teamName);
        },
        [onSelectEntity, setFocusedTeam, setFocusSubcategory, setSelectedCategory],
    );

    const handleCategoryFocus = useCallback(
        (categoryName: string) => {
            if (!categoryName || isUnassignedLabel(categoryName)) {
                return;
            }
            setFocusSubcategory(null);
            onSelectEntity(null);
            setSelectedCategory((current) => (current === categoryName ? null : categoryName));
        },
        [onSelectEntity, setFocusSubcategory, setSelectedCategory],
    );

    // Subcategory / repo selection (new): a second click on the same entity clears it.
    const toggleEntity = useCallback(
        (entity: SelectedEntity) => {
            onSelectEntity(
                selectedEntity?.kind === entity.kind && selectedEntity.name === entity.name
                    ? null
                    : entity,
            );
        },
        [onSelectEntity, selectedEntity],
    );

    // Panel: the side view of whatever the chart is filtered to (entity > team > theme).
    const panel = useMemo(() => {
        const teamNode = focusedTeam
            ? (rawSankeyFlow?.nodes ?? []).find(
                  (node) => node.group === "team" && stripSankeyPrefix(node.name) === focusedTeam,
              )
            : undefined;
        if (selectedEntity) {
            const numbers = computeSelectedPath({
                base: sankeyFlow,
                baseline: baselineFlow,
                name: selectedEntity.name,
            });
            const shareBase = selectedCategory
                ? "the drilled theme"
                : focusedTeam
                  ? `${focusedTeam}'s allocation`
                  : "all allocation";
            return {
                selection: {
                    kind: selectedEntity.kind,
                    label: stripSankeyPrefix(selectedEntity.name),
                },
                numbers,
                shareBase,
                reason: undefined as string | undefined,
            };
        }
        if (teamNode) {
            return {
                selection: { kind: "team" as const, label: focusedTeam ?? teamNode.name },
                numbers: computeSelectedPath({
                    base: unfilteredFlow,
                    baseline: unfilteredBaseline,
                    name: teamNode.name,
                }),
                shareBase: "all allocation",
                reason: undefined as string | undefined,
            };
        }
        if (selectedCategory) {
            return {
                selection: { kind: "theme" as const, label: selectedCategory },
                numbers: computeSelectedPath({
                    base: sankeyFlow,
                    baseline: baselineFlow,
                    name: selectedCategory,
                }),
                shareBase: "all allocation",
                reason: "A theme drill holds only that theme, so its share of all allocation is not shown. Clear the drill to see it.",
            };
        }
        return null;
    }, [
        baselineFlow,
        focusedTeam,
        rawSankeyFlow,
        sankeyFlow,
        selectedCategory,
        selectedEntity,
        unfilteredBaseline,
        unfilteredFlow,
    ]);

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
                        <h3 className="font-(--font-display) text-lg">
                            Team &rarr; Theme &rarr; Repo
                        </h3>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-(--ink-muted)">
                            <span>
                                Team coverage:{" "}
                                <strong className="text-(--ink)">
                                    {formatCoverage(sankeyCoverage.team)}
                                </strong>
                            </span>
                            <span>
                                Repo coverage:{" "}
                                <strong className="text-(--ink)">
                                    {formatCoverage(sankeyCoverage.repo)}
                                </strong>
                            </span>
                        </div>
                    </div>
                    <p className="mt-1 text-xs text-(--ink-muted)">
                        {showSubcategories
                            ? "Team to Theme to Subcategory to Repo"
                            : "Team to Theme to Repo"}
                    </p>
                    {(focusedTeam || selectedCategory || selectedEntity) && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            {focusedTeam && (
                                <button
                                    type="button"
                                    onClick={() => setFocusedTeam(null)}
                                    className="inline-flex items-center gap-2 rounded-full border border-(--card-stroke) px-3 py-1 text-xs uppercase tracking-[0.2em] text-(--ink-muted)"
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
                                    className="inline-flex items-center gap-2 rounded-full border border-(--card-stroke) px-3 py-1 text-xs uppercase tracking-[0.2em] text-(--ink-muted)"
                                >
                                    Drilldown: Theme = {selectedCategory}
                                    <span className="text-xs">x</span>
                                </button>
                            )}
                            {selectedEntity && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        onSelectEntity(null);
                                        if (selectedEntity.kind === "subcategory") {
                                            setFocusSubcategory(null);
                                        }
                                    }}
                                    className="inline-flex items-center gap-2 rounded-full border border-(--card-stroke) px-3 py-1 text-xs uppercase tracking-[0.2em] text-(--ink-muted)"
                                >
                                    Selected: {KIND_CHIP_LABEL[selectedEntity.kind]} ={" "}
                                    {stripSankeyPrefix(selectedEntity.name)}
                                    <span className="text-xs">x</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex flex-col items-start gap-2 text-xs text-(--ink-muted)">
                    {selectedCategory && (
                        <span>
                            Theme focus:{" "}
                            <strong className="text-(--ink)">{selectedCategory}</strong>
                        </span>
                    )}
                    {topCategorySummary.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                            <span>{topSummaryLabel}</span>
                            {topCategorySummary.map((entry) => (
                                <span
                                    key={entry.name}
                                    className="rounded-full border border-(--card-stroke) px-2 py-0.5 text-xs"
                                >
                                    {entry.name}{" "}
                                    {formatNumber(entry.share, { maximumFractionDigits: 0 })}%
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <div className="mb-4 mt-2 border-l-2 border-(--card-stroke) py-1 pl-3 text-xs leading-relaxed text-(--ink-muted)">
                This view shows where effort appears to land across teams, themes, and repos for the
                selected window. Allocation reflects attribution, not dependency or impact.
            </div>
            <div className="mt-0">
                {isSankeyLoading ? (
                    <p className="text-sm text-(--ink-muted)">Loading allocation data...</p>
                ) : !sankeyFlow || !sankeyFlow.links.length ? (
                    <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) text-center text-sm text-(--ink-muted)">
                        {coverageUnavailable
                            ? `Allocation could not be read for this window. ${COVERAGE_UNAVAILABLE_REASON}.`
                            : "No allocation path available for this scope and window."}
                    </div>
                ) : (
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
                        <SankeyChart
                            nodes={(chartFlow ?? sankeyFlow).nodes}
                            links={(chartFlow ?? sankeyFlow).links}
                            unit={effortUnit}
                            height={320}
                            tooltipFormatterAction={sankeyTooltipFormatter}
                            onItemClickAction={(item) => {
                                if (!sankeyFlow) return;
                                if (item.type === "node") {
                                    const node = findClickedNode(sankeyFlow.nodes, item.name);
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
                                        toggleEntity({ kind: "subcategory", name: node.name });
                                        return;
                                    }
                                    if (node?.group === "repo" && !isUnassignedLabel(node.name)) {
                                        toggleEntity({ kind: "repo", name: node.name });
                                    }
                                } else if (item.type === "link" && selectedCategory) {
                                    const subId = resolveSubcategoryIdFromLabel(item.source ?? "");
                                    if (subId) {
                                        setFocusSubcategory(subId);
                                        toggleEntity({ kind: "subcategory", name: item.source! });
                                    }
                                }
                            }}
                        />
                        <SelectedPathPanel
                            selection={panel?.selection ?? null}
                            numbers={panel?.numbers ?? null}
                            unit={effortUnit}
                            shareBase={panel?.shareBase ?? "all allocation"}
                            shareUnavailableReason={panel?.reason}
                            hasBaseline
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
