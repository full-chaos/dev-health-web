import Link from "next/link";
import { formatNumber } from "@/lib/formatters";
import type { FlowSelection } from "./types";

type FlowInspectPanelProps = {
    selection: FlowSelection | null;
    evidenceUrl: string | null;
    flameUrl: string | null;
    contextEntityLabel?: string | null;
    contextZone?: string | null;
    onClearContext: () => void;
};

export function FlowInspectPanel({
    selection,
    evidenceUrl,
    flameUrl,
    contextEntityLabel,
    contextZone,
    onClearContext,
}: FlowInspectPanelProps) {
    return (
        <div className="flex flex-col gap-4">
            <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5 h-full min-h-[400px]">
                <p className="text-[10px] uppercase tracking-[0.15em] text-(--ink-muted)">Inspect Flow</p>
                {!selection ? (
                    <div className="mt-20 text-center">
                        <p className="text-sm text-(--ink-muted)">Select a node or segment to inspect details.</p>
                    </div>
                ) : (
                    <div className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">Selection</p>
                            <h3 className="mt-1 text-lg font-semibold text-foreground">
                                {selection.transition
                                    ? `${selection.transition.from} → ${selection.transition.to}`
                                    : selection.path.join(" → ")}
                            </h3>
                        </div>

                        <div>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">Value</p>
                            <p className="mt-1 text-2xl font-mono text-foreground">
                                {formatNumber(selection.metricValue)}{" "}
                                <span className="text-xs uppercase tracking-wider text-(--ink-muted)">{selection.unit}</span>
                            </p>
                        </div>

                        {selection.percentTotal > 0 && (
                            <div>
                                <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">% of Total</p>
                                <p className="mt-1 text-xl font-mono text-(--accent-2)">
                                    {selection.percentTotal.toFixed(1)}%
                                </p>
                            </div>
                        )}

                        {selection.children && selection.children.length > 0 && (
                            <div>
                                <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted) mb-2">Top Children</p>
                                <div className="space-y-1">
                                    {selection.children.slice(0, 5).map((child) => (
                                        <div key={child.name} className="flex justify-between text-sm">
                                            <span className="text-(--ink-muted)">{child.name}</span>
                                            <span className="font-mono">{formatNumber(child.value)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {selection.outcomes && selection.outcomes.length > 0 && (
                            <div className="animate-in fade-in slide-in-from-left-2 duration-500 delay-100">
                                <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted) mb-2">Panel Outcomes</p>
                                <div className="space-y-2">
                                    {selection.outcomes.map((outcome, idx) => (
                                        <div key={idx} className="flex gap-3 items-start text-sm leading-relaxed text-foreground/90">
                                            <span className="mt-1 text-(--accent-2) text-[10px]">●</span>
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
                                <span>Inspect Evidence</span>
                                <span className="text-(--accent-2) group-hover:translate-x-0.5 transition-transform">↗</span>
                            </Link>
                            <Link
                                href={flameUrl || "#"}
                                className="flex items-center justify-between rounded-xl border border-(--card-stroke) bg-card px-4 py-3 text-xs uppercase tracking-widest text-foreground hover:border-(--accent-2)/40 hover:bg-(--accent-2)/5 group"
                            >
                                <span>Open Representative Flame</span>
                                <span className="text-(--accent-2) group-hover:translate-x-0.5 transition-transform">↗</span>
                            </Link>
                        </div>
                    </div>
                )}
                {(contextEntityLabel || contextZone) && (
                    <div className="pt-4 mt-6 border-t border-(--card-stroke)">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">Analysis Context</p>
                        <p className="mt-1 text-xs text-(--ink-muted) italic">
                            Filtering flow by {contextEntityLabel || "selected scope"} {contextZone ? `(Zone: ${contextZone})` : ""}
                        </p>
                        <button
                            onClick={onClearContext}
                            className="mt-2 text-[9px] uppercase tracking-[0.2em] text-(--accent-2) hover:underline"
                        >
                            Clear context
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
