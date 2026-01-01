"use client";

import type { MetaResponse } from "@/lib/types";
import { formatTimestamp } from "@/lib/formatters";

const backendColors: Record<string, string> = {
    clickhouse: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    postgres: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    sqlite: "bg-green-500/20 text-green-300 border-green-500/30",
    mongo: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
};

const backendLabels: Record<string, string> = {
    clickhouse: "ClickHouse",
    postgres: "PostgreSQL",
    sqlite: "SQLite",
    mongo: "MongoDB",
};

type BackendBannerProps = {
    meta: MetaResponse | null;
};

export function BackendBanner({ meta }: BackendBannerProps) {
    if (!meta) {
        return null;
    }

    const colorClasses = backendColors[meta.backend] || backendColors.clickhouse;
    const label = backendLabels[meta.backend] || meta.backend;

    // Summarize coverage
    const coverageItems = Object.entries(meta.coverage)
        .filter(([, v]) => typeof v === "number" && v > 0)
        .slice(0, 3);

    return (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-xs">
            <span
                className={`rounded-full border px-2 py-0.5 font-semibold uppercase tracking-wider ${colorClasses}`}
            >
                {label}
            </span>
            {/* <span className="text-(--ink-muted)">v{meta.version}</span> */}
            {meta.last_ingest_at && (
                <>
                    <span className="text-(--ink-muted)">•</span>
                    <span className="text-(--ink-muted)">
                        Synced {formatTimestamp(meta.last_ingest_at)}
                    </span>
                </>
            )}
            {coverageItems.length > 0 && (
                <>
                    <span className="text-(--ink-muted)">•</span>
                    <span className="text-(--ink-muted)">
                        {coverageItems.map(([k, v]) => `${v} ${k}`).join(", ")}
                    </span>
                </>
            )}
        </div>
    );
}
