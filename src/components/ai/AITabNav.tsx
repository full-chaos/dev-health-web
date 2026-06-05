"use client";

import { usePathname } from "next/navigation";

import { ModeTabs, type ModeTabItem } from "@/components/shared/ModeTabs";
import { withFilterParam } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";

export type AITabId = "overview" | "impact" | "review-load" | "risk" | "automations";

type AITab = {
    id: AITabId;
    label: string;
    href: string;
};

const AI_TABS: AITab[] = [
    { id: "overview", label: "Overview", href: "/ai" },
    { id: "impact", label: "Impact", href: "/ai/impact" },
    { id: "review-load", label: "Review Load", href: "/ai/review-load" },
    { id: "risk", label: "Governance Risk", href: "/ai/risk" },
    { id: "automations", label: "Automations", href: "/ai/automations" },
];

function activeTabFromPath(pathname: string): AITabId {
    if (pathname === "/ai") return "overview";
    const match = AI_TABS.find(
        (tab) =>
            tab.href !== "/ai" && (pathname === tab.href || pathname.startsWith(tab.href + "/")),
    );
    return match?.id ?? "overview";
}

type AITabNavProps = {
    filters: MetricFilter;
    role?: string;
};

export function AITabNav({ filters, role }: AITabNavProps) {
    const pathname = usePathname();
    const activeTab = activeTabFromPath(pathname);

    const items: ModeTabItem<AITabId>[] = AI_TABS.map((tab) => ({
        id: tab.id,
        label: tab.label,
        href: withFilterParam(tab.href, filters, role),
    }));

    return <ModeTabs items={items} activeId={activeTab} ariaLabel="AI views" />;
}
