"use client";

import { useRef } from "react";
import { publicEnv } from "@/lib/config";

// Flow sub-tabs
export type FlowSubTab = "investment_mix" | "code_hotspots" | "investment_expense" | "state_flow";

const DEMO_MODE = publicEnv.NEXT_PUBLIC_DEMO_MODE === "true";

export const ALL_FLOW_TABS: Array<{
    id: FlowSubTab;
    label: string;
    description: string;
    demoOnly?: boolean;
}> = [
    {
        id: "investment_mix",
        label: "Investment Mix",
        description: "Where effort allocates across investment areas",
    },
    {
        id: "code_hotspots",
        label: "Code Hotspots",
        description: "Where change concentrates in the codebase",
        demoOnly: true,
    },
    {
        id: "investment_expense",
        label: "Investment Expense",
        description: "Effort shift from planned to unplanned work",
        demoOnly: true,
    },
    {
        id: "state_flow",
        label: "State Flow",
        description: "Work item state transitions and flow paths",
    },
];

// Only expose demo-only tabs when NEXT_PUBLIC_DEMO_MODE=true
export const FLOW_TABS = ALL_FLOW_TABS.filter((t) => !t.demoOnly || DEMO_MODE);

type TabsProps = {
    activeTab: FlowSubTab;
    onTabChange: (tab: FlowSubTab) => void;
};

export function Tabs({ activeTab, onTabChange }: TabsProps) {
    const tabRefs = useRef<Partial<Record<FlowSubTab, HTMLButtonElement | null>>>({});

    const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tabId: FlowSubTab) => {
        const currentIndex = FLOW_TABS.findIndex((t) => t.id === tabId);
        let targetIndex: number;

        switch (event.key) {
            case "ArrowLeft":
                event.preventDefault();
                targetIndex = currentIndex > 0 ? currentIndex - 1 : FLOW_TABS.length - 1;
                break;
            case "ArrowRight":
                event.preventDefault();
                targetIndex = currentIndex < FLOW_TABS.length - 1 ? currentIndex + 1 : 0;
                break;
            case "Home":
                event.preventDefault();
                targetIndex = 0;
                break;
            case "End":
                event.preventDefault();
                targetIndex = FLOW_TABS.length - 1;
                break;
            default:
                return;
        }

        const targetTab = FLOW_TABS[targetIndex];
        if (!targetTab) return;
        onTabChange(targetTab.id);
        tabRefs.current[targetTab.id]?.focus();
    };

    return (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Flow visualization tabs">
            {FLOW_TABS.map((tab) => (
                <button
                    key={tab.id}
                    ref={(el) => {
                        tabRefs.current[tab.id] = el;
                    }}
                    id={`flow-tab-${tab.id}`}
                    onClick={() => onTabChange(tab.id)}
                    onKeyDown={(e) => handleTabKeyDown(e, tab.id)}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    aria-controls={`flow-panel-${tab.id}`}
                    tabIndex={activeTab === tab.id ? 0 : -1}
                    className={`rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition ${
                        activeTab === tab.id
                            ? "border-(--accent-2) bg-[color-mix(in_srgb,var(--accent-2)_55%,black)] text-white shadow-sm"
                            : "border-(--card-stroke) text-(--ink-muted) hover:border-(--card-stroke)/60"
                    }`}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}
