import { ModeTabs, type ModeTabItem } from "@/components/shared/ModeTabs";
import { withFilterParam } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";
import { getTabSet, tabHref, type TabIdOf } from "@/lib/navigation/tabs";

// The tab list lives in the tab registry (`lib/navigation/tabs.ts`); this is its id union.
export type GovernanceRiskView = TabIdOf<"ai-governance-risk">;

/** The subview a `?view=` value names; anything unknown is the overview. */
export function governanceRiskViewFromParam(value: string | undefined): GovernanceRiskView {
    const set = getTabSet("ai-governance-risk");
    return set.tabs.find((tab) => tab.id === value)?.id ?? set.defaultTabId;
}

type AIGovernanceRiskTabsProps = {
    view: GovernanceRiskView;
    filters: MetricFilter;
    role?: string;
};

/**
 * In-page mode tabs for the Governance Risk destination (CHAOS-2197): the
 * Test Gaps and Evidence subviews live here rather than as standalone routes.
 * Every href keeps the active filter scope via withFilterParam.
 */
export function AIGovernanceRiskTabs({ view, filters, role }: AIGovernanceRiskTabsProps) {
    const set = getTabSet("ai-governance-risk");
    const items: ModeTabItem<GovernanceRiskView>[] = set.tabs.map((tab) => ({
        id: tab.id,
        label: tab.label,
        href: withFilterParam(tabHref(set, tab.id), filters, role),
    }));

    return <ModeTabs items={items} activeId={view} ariaLabel="Governance Risk views" />;
}
