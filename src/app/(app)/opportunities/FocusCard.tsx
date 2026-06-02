import Link from "next/link";

import { buildExploreUrl } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";
import type { OpportunityCard } from "@/lib/types";

type FocusCardProps = {
  card: OpportunityCard;
  filters: MetricFilter;
  activeRole?: string;
};

/**
 * A single Focus Card, rendered to the Evidence panel contract (CHAOS-2036):
 *
 * - The "Evidence" section links ONLY to real artifacts (`evidence_links`).
 *   When a card has none, the affordance is disabled/renamed rather than
 *   back-filled with recommendations.
 * - "Recommended next step" carries `suggested_experiments` in its own slot,
 *   clearly separated from Evidence so recommendations are never mislabelled
 *   as artifacts.
 */
export function FocusCard({ card, filters, activeRole }: FocusCardProps) {
  const hasArtifacts = card.evidence_links.length > 0;

  return (
    <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6">
      <h2 className="font-(--font-display) text-xl">{card.title}</h2>
      <p className="mt-2 text-sm text-(--ink-muted)">{card.rationale}</p>

      <div className="mt-4" data-testid="focus-card-evidence">
        <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">Evidence</p>
        {hasArtifacts ? (
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {card.evidence_links.map((link) => (
              <Link
                key={link}
                href={buildExploreUrl({ api: link, filters, role: activeRole })}
                className="rounded-full border border-(--card-stroke) bg-(--card) px-3 py-1"
              >
                Open artifact ↗
              </Link>
            ))}
          </div>
        ) : (
          <p
            aria-disabled="true"
            className="mt-2 inline-block rounded-full border border-dashed border-(--card-stroke) bg-(--card-70) px-3 py-1 text-xs text-(--ink-muted)"
          >
            No linked artifacts in this window
          </p>
        )}
      </div>

      {card.suggested_experiments.length > 0 && (
        <div className="mt-4" data-testid="focus-card-next-step">
          <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
            Recommended next step
          </p>
          <div className="mt-2 space-y-2 text-xs text-(--ink-muted)">
            {card.suggested_experiments.map((experiment) => (
              <div
                key={experiment}
                className="rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) px-3 py-2"
              >
                {experiment}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
