"use client";

import { OctagonAlert, TriangleAlert } from "lucide-react";

import { SkeletonLine } from "@/components/ui/Skeleton";
import { STATUS_PILL } from "@/lib/statusPill";

/** A status pill on the tile: icon + word, so color is never the only signal. */
type KpiPill = { label: string; tone: "negative" | "caution" };

const PILL_ICON = { negative: OctagonAlert, caution: TriangleAlert } as const;

interface KpiTileProps {
    label: string;
    value: string | number;
    delta?: number;
    pill?: KpiPill;
    loading?: boolean;
}

function DeltaIndicator({ delta }: { delta: number }) {
    if (delta === 0) {
        return <span className="text-xs text-(--text-muted)">· no change</span>;
    }
    if (delta > 0) {
        return <span className="text-xs text-(--negative)">↑ +{delta}</span>;
    }
    return <span className="text-xs text-(--positive)">↓ {delta}</span>;
}

export function KpiTile({ label, value, delta, pill, loading = false }: KpiTileProps) {
    const PillIcon = pill ? PILL_ICON[pill.tone] : null;

    return (
        <div className="flex flex-col gap-1 rounded-(--radius-md) border border-(--border) bg-(--surface) px-5 py-4">
            <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-(--text-muted)">
                    {label}
                </span>
                {!loading && pill && PillIcon ? (
                    <span
                        data-testid="kpi-pill"
                        data-tone={pill.tone}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_PILL[pill.tone]}`}
                    >
                        <PillIcon aria-hidden="true" className="h-3 w-3" />
                        {pill.label}
                    </span>
                ) : null}
            </div>

            {loading ? (
                <div className="mt-1 space-y-2">
                    <SkeletonLine height="h-8" width="w-1/2" />
                    <SkeletonLine height="h-3" width="w-1/4" />
                </div>
            ) : (
                <>
                    <span className="text-3xl font-bold tabular-nums text-foreground">{value}</span>
                    {delta !== undefined && <DeltaIndicator delta={delta} />}
                </>
            )}
        </div>
    );
}
