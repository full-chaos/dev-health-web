"use client";

import { useState } from "react";

import type { AiOpportunity, AiWorkGraphDrilldownRef } from "@/lib/graphql/__generated__/types";
import { useAIWorkflowDrilldown } from "@/lib/graphql/hooks/useAIReviewRisk";

function OpportunityEvidence({ selected }: { selected: AiWorkGraphDrilldownRef | null }) {
  const { data, fetching, error } = useAIWorkflowDrilldown(selected?.rootType ?? null, selected?.rootId ?? null, { limit: 25 });

  if (!selected) return null;

  if (fetching) {
    return <p className="mt-3 rounded-2xl bg-background/60 px-3 py-2 text-xs text-(--ink-muted)">Loading Work Graph evidence for {selected.label}…</p>;
  }

  if (error) {
    return <p className="mt-3 rounded-2xl border border-(--accent-negative)/30 bg-red-500/5 px-3 py-2 text-xs text-red-600">Evidence unavailable: {error.message}</p>;
  }

  if (!data || !data.dataAvailable) {
    return <p className="mt-3 rounded-2xl bg-background/60 px-3 py-2 text-xs text-(--ink-muted)">No Work Graph edges recorded for {selected.label} yet.</p>;
  }

  return (
    <div className="mt-3 rounded-2xl border border-(--card-stroke) bg-background/50 p-3" data-testid="ai-opportunity-workgraph-evidence">
      <p className="text-xs uppercase tracking-[0.12em] text-(--ink-muted)">
        {data.nodes.length} nodes · {data.edges.length} edges
      </p>
      <ul className="mt-2 space-y-2">
        {data.edges.slice(0, 3).map((edge) => (
          <li key={edge.edgeId} className="text-xs text-(--ink-muted)">
            <span className="font-semibold text-foreground">{edge.edgeType}</span> · {edge.evidence}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AIOpportunityList({ detectorReady, recommendations }: { detectorReady?: boolean; recommendations?: AiOpportunity[] }) {
  const [selectedRef, setSelectedRef] = useState<AiWorkGraphDrilldownRef | null>(null);

  if (!detectorReady) {
    return (
      <div className="rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-80) p-5 text-sm text-(--ink-muted)">
        <p className="font-medium text-foreground">Opportunity engine pending</p>
        <p className="mt-2">Best-fit automation candidates land with CHAOS-1586. This space will suggest repeatable work patterns once that signal becomes available.</p>
      </div>
    );
  }

  if (!recommendations?.length) {
    return <p className="text-sm text-(--ink-muted)">No automation candidates appear in the current scope.</p>;
  }

  return (
    <ol className="space-y-3">
      {recommendations.slice(0, 5).map((item) => (
        <li key={item.opportunityId} className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">{item.title}</p>
              <p className="mt-1 text-sm text-(--ink-muted)">{item.rationale}</p>
            </div>
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-800">{Math.round(item.score * 100)}%</span>
          </div>
          <p className="mt-2 text-xs uppercase tracking-[0.12em] text-(--ink-muted)">
            {item.kind.replace(/_/g, " ")} {item.repoId ? `· ${item.repoId}` : ""} {item.teamId ? `· ${item.teamId}` : ""}
          </p>
          {item.workGraphDrilldowns.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {item.workGraphDrilldowns.map((ref) => {
                const selected = selectedRef?.rootType === ref.rootType && selectedRef.rootId === ref.rootId;
                return (
                  <button
                    key={`${ref.rootType}:${ref.rootId}`}
                    type="button"
                    onClick={() => setSelectedRef(selected ? null : ref)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${selected ? "border-(--accent-positive) bg-(--accent-positive)/10 text-foreground" : "border-(--card-stroke) bg-background/60 text-(--ink-muted) hover:text-foreground"}`}
                  >
                    Work Graph: {ref.label}
                  </button>
                );
              })}
            </div>
          )}
          <OpportunityEvidence selected={selectedRef && item.workGraphDrilldowns.some((ref) => ref.rootType === selectedRef.rootType && ref.rootId === selectedRef.rootId) ? selectedRef : null} />
        </li>
      ))}
    </ol>
  );
}
