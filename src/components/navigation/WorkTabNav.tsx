"use client";

import { ModeTabs, type ModeTabItem } from "@/components/shared/ModeTabs";
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
  const items: ModeTabItem<WorkTab>[] = tabs.map((tab) => ({
    id: tab.id,
    label: tab.label,
    href: withFilterParam(`/work?tab=${tab.id}`, filters, role),
  }));

  return <ModeTabs items={items} activeId={activeTab} ariaLabel="Work views" />;
}
