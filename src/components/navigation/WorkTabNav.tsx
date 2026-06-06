"use client";

import { ViewSet, type ViewSetItem } from "@/components/navigation/ViewSet";
import { CTA_LABELS } from "@/lib/design/cta";
import { withFilterParam } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";
import type { WorkTab } from "@/lib/navigation/workPageView";

export type { WorkTab };

type WorkTabNavProps = {
    activeTab: WorkTab;
    filters: MetricFilter;
    role?: string;
};

const tabs = [
    { id: "overview", label: "Overview" },
    { id: "heatmap", label: "Heatmap" },
    { id: "flame", label: "Flame" },
    { id: "evidence", label: CTA_LABELS.evidence },
    { id: "graph", label: "Work Graph" },
] as const;

export function WorkTabNav({ activeTab, filters, role }: WorkTabNavProps) {
    const items: ViewSetItem[] = tabs.map((tab) => ({
        id: tab.id,
        label: tab.label,
        path: withFilterParam(`/work?view=work&tab=${tab.id}`, filters, role),
        navVisible: true,
    }));

    return (
        <ViewSet
            orientation="tabs"
            items={items}
            activeId={activeTab}
            overviewId="overview"
            ariaLabel="Work views"
        />
    );
}
