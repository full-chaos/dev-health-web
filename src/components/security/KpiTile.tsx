"use client";

import { SkeletonLine } from "@/components/ui/Skeleton";

type KpiTone = "default" | "warn" | "danger";

const ACCENT_CLASSES: Record<KpiTone, string> = {
  default: "border-l-slate-300",
  warn: "border-l-amber-400",
  danger: "border-l-red-600",
};

interface KpiTileProps {
  label: string;
  value: string | number;
  delta?: number;
  tone?: KpiTone;
  loading?: boolean;
}

function DeltaIndicator({ delta }: { delta: number }) {
  if (delta === 0) {
    return <span className="text-xs text-(--ink-muted)">· no change</span>;
  }
  if (delta > 0) {
    return (
      <span className="text-xs text-red-600">
        ↑ +{delta}
      </span>
    );
  }
  return (
    <span className="text-xs text-emerald-600">
      ↓ {delta}
    </span>
  );
}

export function KpiTile({
  label,
  value,
  delta,
  tone = "default",
  loading = false,
}: KpiTileProps) {
  const accentClass = ACCENT_CLASSES[tone];

  return (
    <div
      className={`flex flex-col gap-1 rounded-2xl border border-(--card-stroke) bg-card px-5 py-4 border-l-4 ${accentClass}`}
    >
      <span className="text-xs font-medium uppercase tracking-wider text-(--ink-muted)">
        {label}
      </span>

      {loading ? (
        <div className="mt-1 space-y-2">
          <SkeletonLine height="h-8" width="w-1/2" />
          <SkeletonLine height="h-3" width="w-1/4" />
        </div>
      ) : (
        <>
          <span className="text-3xl font-bold tabular-nums text-foreground">
            {value}
          </span>
          {delta !== undefined && (
            <DeltaIndicator delta={delta} />
          )}
        </>
      )}
    </div>
  );
}
