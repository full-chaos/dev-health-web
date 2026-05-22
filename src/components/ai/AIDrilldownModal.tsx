"use client";

import { useMemo, useState } from "react";

import type { AIFilter } from "@/lib/filters/ai";
import type { AiAttributedPr } from "@/lib/graphql/__generated__/types";
import {
  useAIAttributedPrs,
  useAIWorkflowDrilldownForPr,
} from "@/lib/graphql/hooks/useAIReviewRisk";

const PAGE_SIZE = 25;

type AIDrilldownModalProps = {
  metric: string;
  filter: AIFilter;
  onClose: () => void;
};

function prRowKey(pr: AiAttributedPr): string {
  return `${pr.repoId}:${pr.number}`;
}

function formatMergedAt(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

function useFilteredPrs(rows: AiAttributedPr[] | undefined, search: string): AiAttributedPr[] {
  return useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((pr) => {
      const hay = [pr.title ?? "", pr.kind ?? "", pr.workType ?? "", String(pr.number)]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);
}

function PrTable({
  rows,
  fetching,
  selectedKey,
  onSelect,
}: {
  rows: AiAttributedPr[];
  fetching: boolean;
  selectedKey: string | null;
  onSelect: (pr: AiAttributedPr) => void;
}) {
  if (fetching && rows.length === 0) {
    return (
      <p
        className="rounded-2xl bg-background/60 px-4 py-6 text-center text-sm text-(--ink-muted)"
        data-testid="ai-drilldown-loading"
      >
        Loading AI-attributed pull requests…
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p
        className="rounded-2xl bg-background/60 px-4 py-6 text-center text-sm text-(--ink-muted)"
        data-testid="ai-drilldown-empty"
      >
        No AI-attributed pull requests in this range. Adjust the date range, repo, or work type
        filter to find evidence.
      </p>
    );
  }
  return (
    <div
      className="max-h-72 overflow-y-auto rounded-2xl border border-(--card-stroke)"
      data-testid="ai-drilldown-table"
    >
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-card text-xs uppercase tracking-[0.14em] text-(--ink-muted)">
          <tr>
            <th className="px-3 py-2 font-semibold">PR</th>
            <th className="px-3 py-2 font-semibold">Title</th>
            <th className="px-3 py-2 font-semibold">Kind</th>
            <th className="px-3 py-2 font-semibold">Type</th>
            <th className="px-3 py-2 font-semibold">Merged</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-(--card-stroke)">
          {rows.map((pr) => {
            const key = prRowKey(pr);
            const isSelected = key === selectedKey;
            return (
              <tr
                key={key}
                onClick={() => onSelect(pr)}
                className={`cursor-pointer transition-colors ${isSelected ? "bg-(--accent-positive)/10" : "hover:bg-background/50"}`}
                data-testid="ai-drilldown-pr-row"
                data-pr-key={key}
              >
                <td className="px-3 py-2 font-mono text-xs text-(--ink-muted)">#{pr.number}</td>
                <td className="px-3 py-2">{pr.title ?? "(untitled)"}</td>
                <td className="px-3 py-2">{pr.kind ?? "—"}</td>
                <td className="px-3 py-2 text-(--ink-muted)">{pr.workType ?? "—"}</td>
                <td className="px-3 py-2 text-(--ink-muted)">{formatMergedAt(pr.mergedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EvidencePanel({ selected }: { selected: AiAttributedPr | null }) {
  const rootId = selected ? prRowKey(selected) : null;
  const { data: drilldown, fetching, error } = useAIWorkflowDrilldownForPr(rootId);

  if (!selected) {
    return (
      <p
        className="rounded-2xl bg-background/60 px-4 py-4 text-sm text-(--ink-muted)"
        data-testid="ai-drilldown-evidence-prompt"
      >
        Select a pull request above to load Work Graph evidence (nodes + edges with provenance).
      </p>
    );
  }
  if (fetching) {
    return (
      <p className="rounded-2xl bg-background/60 px-4 py-4 text-sm text-(--ink-muted)">
        Loading evidence for PR #{selected.number}…
      </p>
    );
  }
  if (error) {
    return (
      <p
        className="rounded-2xl border border-(--accent-negative)/30 bg-red-500/5 px-4 py-3 text-sm text-red-600"
        data-testid="ai-drilldown-evidence-error"
      >
        Evidence unavailable: {error.message}
      </p>
    );
  }
  if (!drilldown || !drilldown.dataAvailable) {
    return (
      <p
        className="rounded-2xl bg-background/60 px-4 py-4 text-sm text-(--ink-muted)"
        data-testid="ai-drilldown-evidence-empty"
      >
        No Work Graph edges recorded for this pull request yet.
      </p>
    );
  }
  return (
    <div className="space-y-3" data-testid="ai-drilldown-evidence">
      <div className="flex items-center justify-between text-xs text-(--ink-muted)">
        <span>
          {drilldown.nodes.length} nodes · {drilldown.edges.length} edges
        </span>
        {drilldown.partial && (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-600">
            partial
          </span>
        )}
      </div>
      <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
        {drilldown.edges.slice(0, 25).map((edge) => (
          <li
            key={edge.edgeId}
            className="rounded-2xl border border-(--card-stroke) bg-background/40 px-3 py-2 text-sm"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.12em] text-(--ink-muted)">
              <span className="font-semibold text-foreground">{edge.edgeType}</span>
              <span>
                {edge.sourceType}:{edge.sourceId} → {edge.targetType}:{edge.targetId}
              </span>
              {edge.provider && (
                <span className="rounded-full bg-background px-2 py-0.5">{edge.provider}</span>
              )}
              <span>conf {edge.confidence.toFixed(2)}</span>
            </div>
            <p className="mt-1 text-(--ink-muted)">{edge.evidence}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AIDrilldownModal({ metric, filter, onClose }: AIDrilldownModalProps) {
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const { data, fetching, error } = useAIAttributedPrs(filter, PAGE_SIZE);
  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
  const filteredRows = useFilteredPrs(rows, search);

  // Derive selection from rows so stale selections are dropped automatically
  // when the dashboard filter or fetch result changes — avoids the
  // setState-in-effect cascade flagged by react-hooks/set-state-in-effect.
  const selected = useMemo(
    () => (selectedKey ? (rows.find((row) => prRowKey(row) === selectedKey) ?? null) : null),
    [rows, selectedKey],
  );

  const titleId = "ai-drilldown-title";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onClose}
      data-testid="ai-drilldown-modal"
    >
      <div
        className="w-full max-w-3xl rounded-3xl border border-(--card-stroke) bg-card p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-(--ink-muted)">
              {metric}
            </p>
            <h3 id={titleId} className="font-(--font-display) text-xl">
              Evidence by pull request
            </h3>
            <p className="mt-1 text-sm text-(--ink-muted)">
              Pick an AI-attributed PR to see its Work Graph evidence. Filtered to the current
              dashboard range, repo, and work type.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-(--card-stroke) px-3 py-1 text-xs font-semibold text-(--ink-muted) hover:text-foreground"
            aria-label="Close evidence drilldown"
          >
            Close
          </button>
        </div>

        <label
          className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-(--ink-muted)"
          htmlFor="ai-drilldown-search"
        >
          Filter PRs
        </label>
        <input
          id="ai-drilldown-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search title, kind, or PR number"
          className="mt-1 w-full rounded-full border border-(--card-stroke) bg-background/60 px-4 py-2 text-sm focus:border-(--accent-positive) focus:outline-none"
          data-testid="ai-drilldown-search"
        />

        <div className="mt-4">
          {error ? (
            <p
              className="rounded-2xl border border-(--accent-negative)/30 bg-red-500/5 px-4 py-3 text-sm text-red-600"
              data-testid="ai-drilldown-error"
            >
              Failed to load AI-attributed PRs: {error.message}
            </p>
          ) : (
            <PrTable
              rows={filteredRows}
              fetching={fetching}
              selectedKey={selected ? prRowKey(selected) : null}
              onSelect={(pr) => setSelectedKey(prRowKey(pr))}
            />
          )}
          {data?.hasMore && (
            <p className="mt-2 text-xs text-(--ink-muted)" data-testid="ai-drilldown-has-more">
              Showing the most recent {rows.length} pull requests — narrow the dashboard filters
              (date range, repo, work type) to refine.
            </p>
          )}
        </div>

        <div className="mt-5">
          <EvidencePanel selected={selected} />
        </div>
      </div>
    </div>
  );
}
