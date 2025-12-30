"use client";

import { useMemo, useState } from "react";
import type { MetricFilter } from "@/lib/filters/types";

type ContextStripProps = {
    filters: MetricFilter;
    origin?: string | null;
};

export function ContextStrip({ filters, origin }: ContextStripProps) {
    const [isVisible, setIsVisible] = useState(true);

    const scopeLabel = useMemo(() => {
        const level = filters.scope.level;
        const ids = filters.scope.ids;
        if (!ids.length) return `${level}: all`;
        return `${level}: ${ids.join(", ")}`;
    }, [filters.scope]);

    const timeLabel = useMemo(() => {
        if (filters.time.start_date && filters.time.end_date) {
            return `Elapsed range: ${filters.time.start_date} to ${filters.time.end_date}`;
        }
        return `Elapsed window: ${filters.time.range_days} days`;
    }, [filters.time]);

    if (!isVisible) return null;

    return (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-(--accent-2)/20 bg-(--accent-2)/5 px-4 py-2.5 text-[11px] animate-in fade-in slide-in-from-top-2 duration-500">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                {origin && (
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-(--accent-2) font-bold">
                            Investigation Origin
                        </span>
                        <span className="text-foreground font-medium">
                            {origin}
                        </span>
                    </div>
                )}
                <div className="flex items-center gap-2 border-l border-(--card-stroke) pl-6 first:border-0 first:pl-0">
                    <span className="text-[10px] uppercase tracking-wider text-(--ink-muted) font-semibold">
                        Scope
                    </span>
                    <span className="text-foreground capitalize">
                        {scopeLabel}
                    </span>
                </div>
                <div className="flex items-center gap-2 border-l border-(--card-stroke) pl-6">
                    <span className="text-[10px] uppercase tracking-wider text-(--ink-muted) font-semibold">
                        Time
                    </span>
                    <span className="text-foreground">
                        {timeLabel}
                    </span>
                </div>
            </div>
            <button
                onClick={() => setIsVisible(false)}
                className="text-(--ink-muted) hover:text-foreground transition-colors p-1"
                title="Dismiss context"
            >
                ✕
            </button>
        </div>
    );
}
