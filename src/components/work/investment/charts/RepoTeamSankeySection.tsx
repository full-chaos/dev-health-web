import { useMemo } from "react";
import { SankeyChart } from "@/components/charts/SankeyChart";
import { DataState } from "@/components/ui/DataState";
import { isUnassignedLabel, stripSankeyPrefix, TOP_N_REPOS } from "@/lib/investment";
import {
    computeSelectedPath,
    entityKindForGroup,
    filterSankeyToEntity,
    type SelectedEntity,
} from "@/lib/allocationSelection";
import { SelectedPathPanel } from "./SelectedPathPanel";
import { computeSankeyMetrics } from "@/lib/sankey";
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

export type RepoTeamSankeySectionProps = {
    filters: MetricFilter;
    setFocusSubcategory: (value: string | null) => void;
    effortUnit: string;
    repoTeamFlow: SankeyResponse | null | undefined;
    isRepoTeamLoading: boolean;
    repoTeamFlowFailed: boolean;
    prepareSankeyFlow: PrepareSankeyFlow;
    buildSankeyTooltipFormatter: BuildSankeyTooltipFormatter;
    resolveSubcategoryIdFromLabel: (label: string) => string | null;
    /** Selection (new): filters the chart to that entity; the page subcategory focus still fires. */
    selectedEntity?: SelectedEntity | null;
    onSelectEntity?: (entity: SelectedEntity | null) => void;
};

const KIND_CHIP_LABEL = { team: "Team", theme: "Theme", subcategory: "Subcategory", repo: "Repo" };

export function RepoTeamSankeySection({
    filters,
    setFocusSubcategory,
    effortUnit,
    repoTeamFlow,
    isRepoTeamLoading,
    repoTeamFlowFailed,
    prepareSankeyFlow,
    buildSankeyTooltipFormatter,
    resolveSubcategoryIdFromLabel,
    selectedEntity = null,
    onSelectEntity = () => {},
}: RepoTeamSankeySectionProps) {
    // Only use the persisted server flow; never recompute from workUnits at UX-time.
    const rawRepoTeamSankey = useMemo<
        (SankeyResponse & { hasTeamAssociations: boolean }) | null
    >(() => {
        if (repoTeamFlow) {
            const hasTeams = repoTeamFlow.nodes.some((node) => node.group === "team");
            return { ...repoTeamFlow, hasTeamAssociations: hasTeams };
        }
        return null;
    }, [repoTeamFlow]);

    const repoTeamSankey = useMemo(
        () => prepareSankeyFlow(rawRepoTeamSankey, TOP_N_REPOS),
        [prepareSankeyFlow, rawRepoTeamSankey],
    );
    const repoTeamLinks = repoTeamSankey?.links ?? [];
    const repoTeamNodes = repoTeamSankey?.nodes ?? [];
    const repoTeamHasTeams = rawRepoTeamSankey?.hasTeamAssociations ?? false;

    const repoTeamNodeMap = useMemo(() => {
        const map = new Map<string, SankeyNode>();
        (repoTeamSankey?.nodes ?? []).forEach((node) => {
            map.set(node.name, node);
        });
        return map;
    }, [repoTeamSankey]);

    const repoTeamMetrics = useMemo(
        () =>
            repoTeamSankey
                ? computeSankeyMetrics(repoTeamSankey.nodes, repoTeamSankey.links)
                : null,
        [repoTeamSankey],
    );

    const repoTeamTooltipFormatter = useMemo(
        () =>
            buildSankeyTooltipFormatter({
                nodeMap: repoTeamNodeMap,
                metrics: repoTeamMetrics,
                timeRange: filters.time,
            }),
        [buildSankeyTooltipFormatter, filters.time, repoTeamMetrics, repoTeamNodeMap],
    );

    // What the chart draws: the flow cut to the selected entity, if any.
    const chartFlow = useMemo(
        () =>
            selectedEntity
                ? filterSankeyToEntity(repoTeamSankey, selectedEntity.name)
                : repoTeamSankey,
        [repoTeamSankey, selectedEntity],
    );
    const toggleEntity = (entity: SelectedEntity) =>
        onSelectEntity(
            selectedEntity?.kind === entity.kind && selectedEntity.name === entity.name
                ? null
                : entity,
        );
    // This view has no baseline flow: the panel says so (never a 0%).
    const panelNumbers = useMemo(
        () =>
            selectedEntity
                ? computeSelectedPath({
                      base: repoTeamSankey,
                      baseline: null,
                      name: selectedEntity.name,
                  })
                : null,
        [repoTeamSankey, selectedEntity],
    );

    // A read that produced no flow (failed, or no flow and no error) is unavailable,
    // never a measured "no teams associated" absence; only a produced flow can say that.
    return (
        <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="font-(--font-display) text-lg">Theme &rarr; Repo &rarr; Team</h3>
                    <p className="mt-1 text-xs text-(--ink-muted)">Theme to Repo to Team</p>
                </div>
                <span className="text-xs text-(--ink-muted)">
                    Two-hop allocation to highlight team ownership behind repos.
                </span>
            </div>
            <div className="mb-4 mt-2 border-l-2 border-(--card-stroke) py-1 pl-3 text-xs leading-relaxed text-(--ink-muted)">
                This view uses repo-to-team mapping when available. Missing repo associations are
                routed through an unassigned repo node.
            </div>
            {selectedEntity && (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            onSelectEntity(null);
                            if (selectedEntity.kind === "subcategory") setFocusSubcategory(null);
                        }}
                        className="inline-flex items-center gap-2 rounded-full border border-(--card-stroke) px-3 py-1 text-xs uppercase tracking-[0.2em] text-(--ink-muted)"
                    >
                        Selected: {KIND_CHIP_LABEL[selectedEntity.kind]} ={" "}
                        {stripSankeyPrefix(selectedEntity.name)}
                        <span className="text-xs">x</span>
                    </button>
                </div>
            )}
            <div className="mt-0">
                {isRepoTeamLoading ? (
                    <p className="text-sm text-(--ink-muted)">Loading destination view...</p>
                ) : repoTeamFlowFailed || !repoTeamFlow ? (
                    <DataState
                        variant="detector-unavailable"
                        title="Repo-to-team allocation unavailable"
                        description="The repo-to-team flow could not be loaded for this scope and window."
                    />
                ) : repoTeamHasTeams && repoTeamLinks.length ? (
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
                        <SankeyChart
                            nodes={(chartFlow ?? repoTeamSankey)?.nodes ?? repoTeamNodes}
                            links={(chartFlow ?? repoTeamSankey)?.links ?? repoTeamLinks}
                            unit={effortUnit}
                            height={320}
                            tooltipFormatterAction={repoTeamTooltipFormatter}
                            onItemClickAction={(item) => {
                                if (item.type === "node") {
                                    const normalized = stripSankeyPrefix(item.name ?? "");
                                    const node = repoTeamNodes.find(
                                        (entry) => stripSankeyPrefix(entry.name) === normalized,
                                    );
                                    if (node?.group === "subcategory") {
                                        const subId = resolveSubcategoryIdFromLabel(node.name);
                                        if (subId) setFocusSubcategory(subId);
                                    }
                                    const kind = entityKindForGroup(node?.group);
                                    if (
                                        node &&
                                        (kind === "subcategory" ||
                                            kind === "repo" ||
                                            kind === "team") &&
                                        !isUnassignedLabel(node.name)
                                    ) {
                                        toggleEntity({ kind, name: node.name });
                                    }
                                } else if (item.type === "link") {
                                    const subId = resolveSubcategoryIdFromLabel(item.source ?? "");
                                    if (subId) {
                                        setFocusSubcategory(subId);
                                        toggleEntity({ kind: "subcategory", name: item.source! });
                                    }
                                }
                            }}
                        />
                        <SelectedPathPanel
                            selection={
                                selectedEntity
                                    ? {
                                          kind: selectedEntity.kind,
                                          label: stripSankeyPrefix(selectedEntity.name),
                                      }
                                    : null
                            }
                            numbers={panelNumbers}
                            unit={effortUnit}
                            shareBase="all allocation"
                            hasBaseline={false}
                        />
                    </div>
                ) : (
                    <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) text-center text-sm text-(--ink-muted)">
                        <div>
                            <p>We currently have no teams associated with work items.</p>
                            <p className="mt-2 text-xs text-(--ink-muted)">
                                Investment categories still compute from evidence.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
