"use client";

import Link from "next/link";
import { withFilterParam } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";

export type WorkTab =
  | "landscape"
  | "heatmap"
  | "flow"
  | "investment"
  | "flame"
  | "evidence"
  | "capacity"
  | "graph";

type WorkTabNavProps = {
  activeTab: WorkTab;
  filters: MetricFilter;
  role?: string;
};

const tabs = [
  { id: "landscape", label: "Landscape" },
  { id: "heatmap", label: "Heatmap" },
  { id: "flow", label: "Flow" },
  { id: "investment", label: "Investment" },
  { id: "capacity", label: "Capacity" },
  { id: "flame", label: "Flame" },
  { id: "evidence", label: "Evidence" },
  { id: "graph", label: "Work Graph" },
] as const;

export function WorkTabNav({ activeTab, filters, role }: WorkTabNavProps) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap border-b border-(--card-stroke) px-1 scrollbar-hide">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const href = withFilterParam(`/work?tab=${tab.id}`, filters, role);

        return (
          <Link
            key={tab.id}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px border-b-2 px-3.5 py-3 text-[10px] uppercase tracking-[0.18em] transition-all ${
              isActive
                ? "border-(--accent) text-foreground font-semibold"
                : "border-transparent text-(--ink-muted) hover:border-(--card-stroke) hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
