"use client";

import { useState } from "react";
import { ClientTimestamp } from "@/components/ClientTimestamp";

interface RefreshControlProps {
    /** Invoked on click; may be async (a fetch) or sync (router.refresh()). */
    onRefresh: () => void | Promise<void>;
    /** ISO timestamp of the last successful fetch, or null before the first one lands. */
    lastUpdatedAt: string | null;
    /** True while a refresh triggered elsewhere (e.g. an initial fetch) is in flight. */
    isRefreshing?: boolean;
    className?: string;
}

/**
 * CHAOS-4318: the shared "fetch on mount + explicit Refresh" control that
 * replaces timer-driven polling against the Python API. Every live-progress
 * view (sync runs/units, backfill, customer-push batches) renders this next
 * to its status so the operator can pull a fresh read on demand instead of
 * the tab polling on its own.
 */
export function RefreshControl({
    onRefresh,
    lastUpdatedAt,
    isRefreshing = false,
    className,
}: RefreshControlProps) {
    const [pending, setPending] = useState(false);
    const busy = isRefreshing || pending;

    const handleClick = async () => {
        setPending(true);
        try {
            await onRefresh();
        } finally {
            setPending(false);
        }
    };

    return (
        <div className={`flex items-center gap-3 text-xs text-(--ink-muted) ${className ?? ""}`}>
            <ClientTimestamp
                value={lastUpdatedAt}
                prefix="Last updated: "
                fallback="Not yet loaded"
            />
            <button
                type="button"
                onClick={() => void handleClick()}
                disabled={busy}
                data-testid="refresh-control-button"
                className="rounded-md border border-(--card-stroke) bg-(--card-70) px-2.5 py-1 font-medium text-foreground transition hover:bg-(--card-80) disabled:cursor-not-allowed disabled:opacity-60"
            >
                {busy ? "Refreshing…" : "Refresh"}
            </button>
        </div>
    );
}
