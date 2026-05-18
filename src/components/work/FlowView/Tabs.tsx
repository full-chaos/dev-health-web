"use client";

import { useRef } from "react";
import type { FlowSubTab, FlowTabDef } from "./types";

type FlowTabsProps = {
    tabs: FlowTabDef[];
    activeTab: FlowSubTab;
    onTabChange: (tab: FlowSubTab) => void;
    ariaLabel?: string;
};

export function FlowTabs({ tabs, activeTab, onTabChange, ariaLabel }: FlowTabsProps) {
    const tabRefs = useRef<Partial<Record<FlowSubTab, HTMLButtonElement | null>>>({});

    const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tabId: FlowSubTab) => {
        const currentIndex = tabs.findIndex(t => t.id === tabId);
        let targetIndex: number;

        switch (event.key) {
            case "ArrowLeft":
                event.preventDefault();
                targetIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
                break;
            case "ArrowRight":
                event.preventDefault();
                targetIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
                break;
            case "Home":
                event.preventDefault();
                targetIndex = 0;
                break;
            case "End":
                event.preventDefault();
                targetIndex = tabs.length - 1;
                break;
            default:
                return;
        }

        const targetTab = tabs[targetIndex];
        if (!targetTab) return;
        onTabChange(targetTab.id);
        tabRefs.current[targetTab.id]?.focus();
    };

    return (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label={ariaLabel ?? "Flow visualization tabs"}>
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    ref={(el) => { tabRefs.current[tab.id] = el; }}
                    id={`flow-tab-${tab.id}`}
                    onClick={() => onTabChange(tab.id)}
                    onKeyDown={(e) => handleTabKeyDown(e, tab.id)}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    aria-controls={`flow-panel-${tab.id}`}
                    tabIndex={activeTab === tab.id ? 0 : -1}
                    className={`rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition ${
                        activeTab === tab.id
                            ? "border-(--accent-2) bg-(--accent-2) text-white"
                            : "border-(--card-stroke) text-(--ink-muted) hover:border-(--card-stroke)/60"
                    }`}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}
