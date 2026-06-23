"use client";

import { InvestmentView } from "@/components/work/InvestmentView";
import type { MetricFilter } from "@/lib/filters/types";
import type { MetricDelta, ReworkThemeAllocation } from "@/lib/types";
import type { InvestmentTab } from "@/components/work/investment/types";

type InvestmentGatedBodyProps = {
    /** True only when the org is entitled to the `investment_view` feature. */
    enabled: boolean;
    filters: MetricFilter;
    activeRole?: string;
    activeTab?: InvestmentTab;
    reworkMetric?: MetricDelta;
    reworkThemeAllocation?: ReworkThemeAllocation[];
};

/**
 * Entitlement boundary for the Investment view (CHAOS-2608 / CS7).
 *
 * `InvestmentView` mounts data hooks (`useInvestmentData`,
 * `useWorkUnitTeamAttributions`) the moment it renders. `UpgradeGate` renders
 * its children in a hidden, blurred preview when the feature is locked — so
 * mounting `InvestmentView` unconditionally would fire those org-scoped queries
 * for orgs that lack the `investment_view` entitlement. The backend enforces
 * tenant isolation (`require_org_id`) but NOT feature tier, so that would be a
 * feature-entitlement bypass.
 *
 * We therefore mount the data-fetching subtree ONLY when `enabled`. When locked
 * we render a static, non-data-fetching placeholder so the UpgradeGate preview
 * has something to blur without ever touching the investment data hooks.
 */
export function InvestmentGatedBody({ enabled, ...viewProps }: InvestmentGatedBodyProps) {
    if (!enabled) {
        return <InvestmentPreviewPlaceholder />;
    }
    return <InvestmentView {...viewProps} />;
}

/** Static, hook-free skeleton shown inside the locked UpgradeGate preview. */
function InvestmentPreviewPlaceholder() {
    return (
        <div
            aria-hidden="true"
            data-testid="investment-preview-placeholder"
            className="flex flex-col gap-6"
        >
            <div className="grid gap-4 lg:grid-cols-2">
                <div className="h-28 rounded-2xl border border-(--card-stroke) bg-(--card-70)" />
                <div className="h-28 rounded-2xl border border-(--card-stroke) bg-(--card-70)" />
            </div>
            <div className="h-64 rounded-3xl border border-(--card-stroke) bg-(--card-70)" />
            <div className="h-40 rounded-3xl border border-(--card-stroke) bg-(--card-70)" />
        </div>
    );
}
