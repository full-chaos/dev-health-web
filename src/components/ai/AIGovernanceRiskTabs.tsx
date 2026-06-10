import { ModeTabs, type ModeTabItem } from "@/components/shared/ModeTabs";
import { withFilterParam } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";

export type GovernanceRiskView = "overview" | "test-gaps" | "evidence";

const GOVERNANCE_RISK_TABS: ReadonlyArray<{ id: GovernanceRiskView; label: string; href: string }> =
    [
        { id: "overview", label: "Overview", href: "/ai/risk" },
        { id: "test-gaps", label: "Test Gaps", href: "/ai/risk?view=test-gaps" },
        // design-lint-disable-next-line cta-from-registry -- "Evidence" is the tab/nav label (CHAOS-2197), not a CTA
        { id: "evidence", label: "Evidence", href: "/ai/risk?view=evidence" },
    ];

export function governanceRiskViewFromParam(value: string | undefined): GovernanceRiskView {
    return value === "test-gaps" || value === "evidence" ? value : "overview";
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
    const items: ModeTabItem<GovernanceRiskView>[] = GOVERNANCE_RISK_TABS.map((tab) => ({
        id: tab.id,
        label: tab.label,
        href: withFilterParam(tab.href, filters, role),
    }));

    return <ModeTabs items={items} activeId={view} ariaLabel="Governance Risk views" />;
}
