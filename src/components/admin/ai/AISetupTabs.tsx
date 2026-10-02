"use client";

import { usePathname } from "next/navigation";
import { useAdminTier } from "@/components/admin/AdminTierContext";
import { ViewSet } from "@/components/navigation/ViewSet";
import { activeAISetupTab, visibleAISetupTabs } from "@/lib/admin/aiSetup";

/**
 * The AI Setup views (BYO LLM), under the page header and the Organization tab row. Only the
 * views the organization is entitled to are listed.
 */
export function AISetupTabs() {
    const pathname = usePathname();
    const { features } = useAdminTier();
    const tabs = visibleAISetupTabs(features);

    return (
        <ViewSet
            orientation="tabs"
            items={tabs}
            activeId={activeAISetupTab(pathname)}
            ariaLabel="AI Setup views"
        />
    );
}
