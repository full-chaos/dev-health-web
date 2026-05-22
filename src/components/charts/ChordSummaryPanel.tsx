import type { ChordDataset } from "@/lib/types";
import { SkeletonLine } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

type ChordSummaryPanelProps = {
  dataset: ChordDataset | null;
  unit?: string;
  loading?: boolean;
  className?: string;
  onEntitySelect?: (entityId: string) => void;
};

function formatCompactValue(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toFixed(0);
}

export function ChordSummaryPanel({
  dataset,
  unit,
  loading,
  className = "",
  onEntitySelect,
}: ChordSummaryPanelProps) {
  if (loading) {
    return (
      <section className={`rounded-3xl border border-(--card-stroke) bg-card p-4 ${className}`}>
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <SkeletonLine width="w-1/3" height="h-3" />
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, j) => (
                  <SkeletonLine key={j} width="w-full" height="h-5" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!dataset || dataset.nodes.length === 0) {
    return (
      <section className={`rounded-3xl border border-(--card-stroke) bg-card p-4 ${className}`}>
        <EmptyState
          title="No summary yet"
          description="Adjust filters to reveal exchange patterns."
        />
      </section>
    );
  }

  const { summary, nodes } = dataset;
  const otherNodesCount = nodes.filter((n) => n.isOther).length;

  const handleSelect = (id: string) => {
    if (onEntitySelect) {
      onEntitySelect(id);
    }
  };

  return (
    <section
      className={`rounded-3xl border border-(--card-stroke) bg-card p-4 space-y-6 ${className}`}
    >
      {/* Top Importers */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-(--ink-muted) mb-3">
          Top importers
        </h3>
        {summary.topImporters.length === 0 ? (
          <div className="text-(--ink-muted)">—</div>
        ) : (
          <div className="flex flex-col gap-1">
            {summary.topImporters.slice(0, 5).map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className="flex items-center justify-between w-full text-left px-2 py-1.5 -mx-2 rounded hover:bg-(--card-70) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) transition-colors"
                aria-label={`Rank ${idx + 1}: ${item.label}, +${formatCompactValue(item.net)} ${unit || ""} net imported`}
              >
                <span className="flex items-center gap-2 overflow-hidden">
                  <span className="text-xs text-(--ink-muted) w-4 text-right shrink-0">
                    {idx + 1}
                  </span>
                  <span className="truncate text-sm font-medium">{item.label}</span>
                </span>
                <span className="text-sm text-(--accent-positive) font-mono shrink-0 ml-2">
                  +{formatCompactValue(item.net)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Top Exporters */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-(--ink-muted) mb-3">
          Top exporters
        </h3>
        {summary.topExporters.length === 0 ? (
          <div className="text-(--ink-muted)">—</div>
        ) : (
          <div className="flex flex-col gap-1">
            {summary.topExporters.slice(0, 5).map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className="flex items-center justify-between w-full text-left px-2 py-1.5 -mx-2 rounded hover:bg-(--card-70) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) transition-colors"
                aria-label={`Rank ${idx + 1}: ${item.label}, -${formatCompactValue(item.net)} ${unit || ""} net exported`}
              >
                <span className="flex items-center gap-2 overflow-hidden">
                  <span className="text-xs text-(--ink-muted) w-4 text-right shrink-0">
                    {idx + 1}
                  </span>
                  <span className="truncate text-sm font-medium">{item.label}</span>
                </span>
                <span className="text-sm text-(--accent-negative) font-mono shrink-0 ml-2">
                  -{formatCompactValue(item.net)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Strongest Bilateral */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-(--ink-muted) mb-3">
          Strongest exchange
        </h3>
        {summary.strongestBilateral.length === 0 ? (
          <div className="text-(--ink-muted)">—</div>
        ) : (
          <div className="flex flex-col gap-1">
            {summary.strongestBilateral.slice(0, 5).map((item, idx) => {
              const nodeA = nodes.find((n) => n.id === item.a)?.label || item.a;
              const nodeB = nodes.find((n) => n.id === item.b)?.label || item.b;
              return (
                <button
                  key={`${item.a}-${item.b}`}
                  type="button"
                  onClick={() => handleSelect(item.a)}
                  className="flex items-center justify-between w-full text-left px-2 py-1.5 -mx-2 rounded hover:bg-(--card-70) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) transition-colors"
                  aria-label={`Rank ${idx + 1}: ${nodeA} and ${nodeB}, ${formatCompactValue(item.bilateralValue)} ${unit || ""} exchanged`}
                >
                  <span className="flex items-center gap-2 overflow-hidden">
                    <span className="text-xs text-(--ink-muted) w-4 text-right shrink-0">
                      {idx + 1}
                    </span>
                    <span className="truncate text-sm font-medium">
                      {nodeA} <span className="text-(--ink-muted) font-normal mx-0.5">↔</span>{" "}
                      {nodeB}
                    </span>
                  </span>
                  <span className="text-sm font-mono shrink-0 ml-2">
                    {formatCompactValue(item.bilateralValue)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Overflow Row */}
      {summary.otherShare > 0 && (
        <div className="pt-2 border-t border-(--card-stroke)">
          <p className="text-xs text-(--ink-muted) text-center">
            {(summary.otherShare * 100).toFixed(1)}% of flow collapsed into &apos;Other&apos; (
            {otherNodesCount} entities)
          </p>
        </div>
      )}
    </section>
  );
}
