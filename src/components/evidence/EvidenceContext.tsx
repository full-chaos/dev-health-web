"use client";

import { useActiveRole } from "@/components/RoleSelector";
import { getRoleConfig } from "@/lib/roleContext";
import { MetricFilter } from "@/lib/filters/types";

type EvidenceContextProps = {
    data: any;
    filters: MetricFilter;
};

export function EvidenceContext({ data, filters }: EvidenceContextProps) {
    const activeRole = useActiveRole();
    const roleConfig = getRoleConfig(activeRole);

    const trendColor = data.trend === "up" ? "text-green-400" : data.trend === "down" ? "text-red-400" : "text-(--ink-muted)";
    const trendIcon = data.trend === "up" ? "↗" : data.trend === "down" ? "↘" : "→";

    return (
        <section className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
                    Context
                </p>
                {data.trend && (
                    <div className={`flex items-center gap-1 text-xs font-medium ${trendColor} bg-${trendColor}/10 px-2 py-1 rounded-full border border-${trendColor}/20`}>
                        <span>{trendIcon}</span>
                        <span>{data.magnitude || "Moderate"} shift</span>
                    </div>
                )}
            </div>

            <div className="p-4 rounded-2xl bg-(--card-90) border border-(--card-stroke)">
                <p className="text-sm leading-relaxed text-foreground">
                    <span className="font-semibold text-(--accent-2)">{roleConfig.framing}</span>{" "}
                    {data.summary || "No summary available for this metric."}
                </p>
            </div>

            {data.why_it_matters && (
                <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-foreground">Why this matters</h4>
                    <p className="text-xs text-(--ink-muted) leading-relaxed">
                        {data.why_it_matters}
                    </p>
                </div>
            )}
        </section>
    );
}
