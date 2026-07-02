"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { buildExampleSnippets } from "@/lib/customer-push/examples";
import { CTA_LABELS } from "@/lib/design/cta";
import type { CustomerPushSystem } from "@/lib/admin/types";

type SetupExamplesTabsProps = {
    sourceSystem: CustomerPushSystem;
    sourceInstance: string;
};

export function SetupExamplesTabs({ sourceSystem, sourceInstance }: SetupExamplesTabsProps) {
    const tabs = useMemo(
        () => buildExampleSnippets({ sourceSystem, sourceInstance }),
        [sourceSystem, sourceInstance],
    );
    const [activeId, setActiveId] = useState(tabs[0].id);
    const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

    const handleCopy = async () => {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(active.code);
            toast.success("Copied to clipboard");
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2 border-b border-(--card-stroke)">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveId(tab.id)}
                        className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                            tab.id === active.id
                                ? "border-(--accent) text-foreground"
                                : "border-transparent text-(--ink-muted) hover:text-foreground"
                        }`}
                    >
                        {tab.label}
                        {tab.badge && (
                            <span className="rounded-full border border-(--border-subtle) px-1.5 py-0.5 text-xs font-medium text-(--ink-muted)">
                                {tab.badge}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            <div className="relative overflow-hidden rounded-xl border border-(--card-stroke) bg-(--card-80)">
                <div className="flex items-center justify-between border-b border-(--card-stroke) px-4 py-2">
                    <span className="text-xs text-(--ink-muted) uppercase tracking-wider">
                        {active.language}
                    </span>
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="text-xs font-medium text-(--ink-muted) hover:text-foreground"
                    >
                        {CTA_LABELS.copy}
                    </button>
                </div>
                <pre className="overflow-x-auto p-4 text-xs text-foreground">
                    <code>{active.code}</code>
                </pre>
            </div>
        </div>
    );
}
