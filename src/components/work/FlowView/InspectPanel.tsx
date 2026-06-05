import Link from "next/link";
import type { MetricFilter } from "@/lib/filters/types";
import { withFilterParam } from "@/lib/filters/url";
import { CTA_LABELS } from "@/lib/design/cta";
import { formatNumber } from "@/lib/formatters";
import type { FlowSubTab } from "./Tabs";

const WORK_GRAPH_CONNECTION_BY_VIEW: Partial<Record<string, string>> = {
    state_flow: "work-to-change",
    code_hotspots: "change-to-code",
};

export const buildFlowWorkGraphUrl = (
    selection: Pick<FlowSelection, "view" | "hotspot" | "investment">,
    filters: MetricFilter,
    activeRole?: string,
) => {
    const drilldownFilters: MetricFilter = selection.hotspot?.repoId
        ? {
              ...filters,
              what: { ...filters.what, repos: [selection.hotspot.repoId] },
          }
        : filters;
    const baseHref = withFilterParam("/work?tab=graph", drilldownFilters, activeRole);
    const connection = WORK_GRAPH_CONNECTION_BY_VIEW[selection.view];
    const [path, query = ""] = baseHref.split("?", 2);
    const params = new URLSearchParams(query);
    if (connection) {
        params.set("graph_connection", connection);
    }
    if (selection.hotspot?.filePath) {
        params.set("graph_node", `FILE:${selection.hotspot.filePath}`);
    }
    if (selection.investment?.themeKey) {
        params.set("graph_theme", selection.investment.themeKey);
    }
    if (selection.investment?.subcategoryKey) {
        params.set("graph_subcategory", selection.investment.subcategoryKey);
    }

    return `${path}?${params.toString()}`;
};

export type FlowSelection = {
    view: FlowSubTab;
    path: string[];
    key?: string;
    metricValue: number;
    percentTotal: number;
    unit: string;
    children?: Array<{ name: string; value: number }>;
    transition?: { from: string; to: string };
    outcomes?: string[];
    hotspot?: {
        repoId?: string;
        filePath?: string;
    };
    investment?: {
        themeKey: string;
        subcategoryKey?: string;
    };
};

type InspectPanelProps = {
    selection: FlowSelection | null;
    evidenceUrl: string | null;
    flameUrl: string | null;
    filters: MetricFilter;
    activeRole?: string;
    contextEntityLabel: string | null;
    contextZone: string | null;
    onClearContext: () => void;
};

export function InspectPanel({
    selection,
    evidenceUrl,
    flameUrl,
    filters,
    activeRole,
    contextEntityLabel,
    contextZone,
    onClearContext,
}: InspectPanelProps) {
    return (
        <div className="flex flex-col gap-4">
            <div className="h-full min-h-96 rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5">
                <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                    Inspect Flow
                </p>
                {!selection ? (
                    <div className="mt-20 text-center">
                        <p className="text-sm text-(--ink-muted)">
                            Select a node or segment to inspect details.
                        </p>
                    </div>
                ) : (
                    <div className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                Selection
                            </p>
                            <h3 className="mt-1 text-lg font-semibold text-foreground">
                                {selection.transition
                                    ? `${selection.transition.from} → ${selection.transition.to}`
                                    : selection.path.join(" → ")}
                            </h3>
                        </div>

                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                Value
                            </p>
                            <p className="mt-1 text-2xl font-mono text-foreground">
                                {formatNumber(selection.metricValue)}{" "}
                                <span className="text-xs uppercase tracking-wider text-(--ink-muted)">
                                    {selection.unit}
                                </span>
                            </p>
                        </div>

                        {selection.percentTotal > 0 && (
                            <div>
                                <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                    % of Total
                                </p>
                                <p className="mt-1 text-xl font-mono text-(--accent-2)">
                                    {formatNumber(selection.percentTotal)}%
                                </p>
                            </div>
                        )}

                        {selection.children && selection.children.length > 0 && (
                            <div>
                                <p className="mb-2 text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                    Top Children
                                </p>
                                <div className="space-y-1">
                                    {selection.children.slice(0, 5).map((child) => (
                                        <div
                                            key={child.name}
                                            className="flex justify-between text-sm"
                                        >
                                            <span className="text-(--ink-muted)">{child.name}</span>
                                            <span className="font-mono">
                                                {formatNumber(child.value)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {selection.outcomes && selection.outcomes.length > 0 && (
                            <div className="animate-in fade-in slide-in-from-left-2 duration-500 delay-100">
                                <p className="mb-2 text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                    Panel Outcomes
                                </p>
                                <div className="space-y-2">
                                    {selection.outcomes.map((outcome) => (
                                        <div
                                            key={outcome}
                                            className="flex gap-3 items-start text-sm leading-relaxed text-foreground/90"
                                        >
                                            <span className="mt-1 text-xs text-(--accent-2)">
                                                ●
                                            </span>
                                            <span>{outcome}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="grid gap-3 pt-4 border-t border-(--card-stroke)">
                            <Link
                                href={evidenceUrl || "#"}
                                className="flex items-center justify-between rounded-xl border border-(--card-stroke) bg-card px-4 py-3 text-xs uppercase tracking-widest text-foreground hover:border-(--accent-2)/40 hover:bg-(--accent-2)/5 group"
                            >
                                <span>{CTA_LABELS.openEvidence}</span>
                                <span className="text-(--accent-2) group-hover:translate-x-0.5 transition-transform">
                                    ↗
                                </span>
                            </Link>
                            <Link
                                href={flameUrl || "#"}
                                className="flex items-center justify-between rounded-xl border border-(--card-stroke) bg-card px-4 py-3 text-xs uppercase tracking-widest text-foreground hover:border-(--accent-2)/40 hover:bg-(--accent-2)/5 group"
                            >
                                <span>{CTA_LABELS.openArtifact}</span>
                                <span className="text-(--accent-2) group-hover:translate-x-0.5 transition-transform">
                                    ↗
                                </span>
                            </Link>
                            <Link
                                href={buildFlowWorkGraphUrl(selection, filters, activeRole)}
                                className="flex items-center justify-between rounded-xl border border-(--card-stroke) bg-card px-4 py-3 text-xs uppercase tracking-widest text-foreground hover:border-(--accent-2)/40 hover:bg-(--accent-2)/5 group"
                            >
                                <span>{CTA_LABELS.openWorkGraph}</span>
                                <span className="text-(--accent-2) group-hover:translate-x-0.5 transition-transform">
                                    ↗
                                </span>
                            </Link>
                        </div>
                    </div>
                )}
                {(contextEntityLabel || contextZone) && (
                    <div className="pt-4 mt-6 border-t border-(--card-stroke)">
                        <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                            Analysis Context
                        </p>
                        <p className="mt-1 text-xs text-(--ink-muted) italic">
                            Filtering flow by {contextEntityLabel || "selected scope"}{" "}
                            {contextZone ? `(Zone: ${contextZone})` : ""}
                        </p>
                        <button
                            type="button"
                            onClick={onClearContext}
                            className="mt-2 text-xs uppercase tracking-[0.2em] text-(--accent-2) hover:underline"
                        >
                            {CTA_LABELS.clearContext}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
