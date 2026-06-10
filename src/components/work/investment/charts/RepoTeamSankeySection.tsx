import { useMemo } from "react";
import { SankeyChart } from "@/components/charts/SankeyChart";
import { DataState } from "@/components/ui/DataState";
import { stripSankeyPrefix, TOP_N_REPOS } from "@/lib/investment";
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

type RepoTeamSankeySectionProps = {
    filters: MetricFilter;
    setFocusSubcategory: (value: string | null) => void;
    effortUnit: string;
    repoTeamFlow: SankeyResponse | null | undefined;
    isRepoTeamLoading: boolean;
    repoTeamFlowFailed: boolean;
    prepareSankeyFlow: PrepareSankeyFlow;
    buildSankeyTooltipFormatter: BuildSankeyTooltipFormatter;
    resolveSubcategoryIdFromLabel: (label: string) => string | null;
};

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

    return (
        <div className="rounded-3xl border border-(--border) bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="font-(--font-display) text-lg">Theme &rarr; Repo &rarr; Team</h3>
                    <p className="mt-1 text-xs text-(--ink-muted)">Theme to Repo to Team</p>
                </div>
                <span className="text-xs text-(--ink-muted)">
                    Two-hop allocation to highlight team ownership behind repos.
                </span>
            </div>
            <div className="mb-4 mt-2 border-l-2 border-(--border) py-1 pl-3 text-xs leading-relaxed text-(--ink-muted)">
                This view uses repo-to-team mapping when available. Missing repo associations are
                routed through an unassigned repo node.
            </div>
            <div className="mt-0">
                {isRepoTeamLoading ? (
                    <p className="text-sm text-(--ink-muted)">Loading destination view...</p>
                ) : repoTeamFlowFailed ? (
                    <DataState
                        variant="detector-unavailable"
                        title="Repo-to-team allocation unavailable"
                        description="The repo-to-team flow could not be loaded for this scope and window."
                    />
                ) : repoTeamHasTeams && repoTeamLinks.length ? (
                    <SankeyChart
                        nodes={repoTeamNodes}
                        links={repoTeamLinks}
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
                            } else if (item.type === "link") {
                                const subId = resolveSubcategoryIdFromLabel(item.source ?? "");
                                if (subId) setFocusSubcategory(subId);
                            }
                        }}
                    />
                ) : (
                    <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-(--border) bg-(--card-70) text-center text-sm text-(--ink-muted)">
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
