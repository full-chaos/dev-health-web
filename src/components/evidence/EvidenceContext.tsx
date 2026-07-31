"use client";

import { useActiveRole } from "@/lib/lensContext.client";
import { getRoleConfig } from "@/lib/roleContext";

type EvidenceData = {
    trend?: "up" | "down" | "flat";
    magnitude?: string;
    summary?: string;
    why_it_matters?: string;
};

type EvidenceContextProps = {
    data: EvidenceData;
};

export function EvidenceContext({ data }: EvidenceContextProps) {
    const activeRole = useActiveRole();
    const roleConfig = getRoleConfig(activeRole);

    const trendTone =
        data.trend === "up"
            ? "border-green-400/20 bg-green-400/10 text-green-300"
            : data.trend === "down"
              ? "border-red-400/20 bg-red-400/10 text-red-300"
              : "border-(--card-stroke) bg-(--card-70) text-(--ink-muted)";
    const trendIcon = data.trend === "up" ? "↗" : data.trend === "down" ? "↘" : "→";

    return (
        <section className="space-y-3 rounded-2xl border border-(--card-stroke) bg-(--card-90) p-4">
            <div className="flex items-center justify-between">
                <p className="text-label-caps uppercase tracking-[0.2em] text-(--ink-muted)">
                    Context
                </p>
                {data.trend && (
                    <div
                        className={`flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${trendTone}`}
                    >
                        <span>{trendIcon}</span>
                        <span>{data.magnitude || "Moderate"} shift</span>
                    </div>
                )}
            </div>

            <div className="rounded-xl border border-(--card-stroke) bg-background/35 p-3">
                <p className="text-sm leading-6 text-foreground">
                    <span className="font-semibold text-(--accent)">{roleConfig.framing}</span>{" "}
                    {data.summary || "No summary available for this metric."}
                </p>
            </div>

            {data.why_it_matters && (
                <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-foreground">Why this matters</h4>
                    <p className="text-xs leading-5 text-(--ink-muted)">{data.why_it_matters}</p>
                </div>
            )}
        </section>
    );
}
