"use client";

import { usePathname } from "next/navigation";
import { useAdminTier } from "@/components/admin/AdminTierContext";
import { ViewSet } from "@/components/navigation/ViewSet";
import { activeAISetupTab, visibleAISetupTabs } from "@/lib/admin/aiSetup";

export function AISetupShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { features } = useAdminTier();
    const tabs = visibleAISetupTabs(features);

    return (
        <div className="flex flex-col gap-8">
            <div>
                <header>
                    <p className="text-label-caps text-(--text-muted)">Organization settings</p>
                    <h1 className="mt-2 text-h1 text-(--text-primary)">AI Setup</h1>
                    <p className="mt-2 max-w-2xl text-body text-(--text-secondary)">
                        Manage Ask Dev controls and organization-owned model provider settings as
                        separate capabilities.
                    </p>
                </header>
                <ViewSet
                    orientation="tabs"
                    items={tabs}
                    activeId={activeAISetupTab(pathname)}
                    ariaLabel="AI Setup views"
                    className="mt-6"
                />
            </div>
            {children}
        </div>
    );
}
