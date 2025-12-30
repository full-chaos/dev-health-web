"use client";

import Link from "next/link";
import { withFilterParam } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";

export type WorkTab = "landscape" | "heatmap" | "flow" | "flame" | "evidence";

type WorkTabNavProps = {
    activeTab: WorkTab;
    filters: MetricFilter;
    role?: string;
};

const tabs = [
    { id: "landscape", label: "Landscape" },
    { id: "heatmap", label: "Heatmap" },
    { id: "flow", label: "Flow" },
    { id: "flame", label: "Flame" },
    { id: "evidence", label: "Evidence" },
] as const;

export function WorkTabNav({ activeTab, filters, role }: WorkTabNavProps) {
    return (
        <div className="flex flex-wrap items-center gap-1 border-b border-(--card-stroke) overflow-x-auto whitespace-nowrap scrollbar-hide">
            {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                const href = withFilterParam(`/work?tab=${tab.id}`, filters, role);

                return (
                    <Link
                        key={tab.id}
                        href={href}
                        aria-current={isActive ? "page" : undefined}
                        className={`px-4 py-3 text-[10px] uppercase tracking-[0.2em] transition-all border-b-2 -mb-px ${isActive
                            ? "border-(--accent-2) text-foreground font-semibold"
                            : "border-transparent text-(--ink-muted) hover:text-foreground hover:border-(--card-stroke)/40"
                            }`}
                    >
                        {tab.label}
                    </Link>
                );
            })}
        </div>
    );
}
