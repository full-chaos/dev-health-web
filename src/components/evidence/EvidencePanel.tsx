"use client";

import { useEffect, useState } from "react";
import { getExplainData } from "@/lib/api/home";
import { ValidationErrors } from "@/lib/constants/errors";
import { logger } from "@/lib/logger";
import { MetricFilter } from "@/lib/filters/types";
import { Contributor } from "@/lib/types";
import { EvidenceContext } from "./EvidenceContext";
import { EvidenceItems } from "./EvidenceItems";
import { SuggestedActions } from "./SuggestedActions";
import { buildExploreUrl } from "@/lib/filters/url";
import { getMetricDefinition } from "@/lib/metrics/definitions";
import Link from "next/link";

type EvidenceItem = {
  id: string;
  title: string;
  url: string;
  type: "pr" | "issue" | "commit" | "other";
  meta?: string;
};

type EvidenceProvenance = {
  last_sync?: string | null;
  source?: string | null;
  identity_confidence?: number | null;
  quality?: string | null;
  partial?: boolean;
};

type Action = {
  id: string;
  label: string;
  type: "experiment" | "process" | "tooling";
};

type EvidencePanelData = {
  metric?: string;
  label?: string;
  value?: number;
  delta_pct?: number;
  summary: string;
  trend: "up" | "down" | "flat";
  magnitude: string;
  why_it_matters?: string;
  evidence: EvidenceItem[];
  actions: Action[];
  provenance?: EvidenceProvenance;
};

export type EvidencePanelProps = {
  isOpen: boolean;
  onCloseAction: () => void;
  title: string;
  apiUrl?: string;
  metric?: string;
  filters: MetricFilter;
};

export function EvidencePanel({
  isOpen,
  onCloseAction,
  title,
  apiUrl,
  metric,
  filters,
}: EvidencePanelProps) {
  const [data, setData] = useState<EvidencePanelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseAction();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onCloseAction]);

  useEffect(() => {
    if (isOpen && (apiUrl || metric)) {
      setLoading(true);
      setError(null);

      const fetchData = async () => {
        try {
          let result;
          if (apiUrl) {
            const res = await fetch(apiUrl);
            if (!res.ok) throw new Error(ValidationErrors.FailedToFetchEvidence);
            result = await res.json();
          } else if (metric) {
            result = await getExplainData({
              metric,
              filters,
            });
          }

          if (result) {
            const metricKey = result.metric || metric;
            const definition = metricKey ? getMetricDefinition(metricKey) : undefined;

            const deltaPct = result.delta_pct || 0;
            const trend = deltaPct > 0 ? "up" : deltaPct < 0 ? "down" : "flat";
            const magnitude = Math.abs(deltaPct) > 10 ? "Significant" : "Moderate";

            const rawEvidence: EvidenceItem[] =
              result.evidence ||
              [...(result.drivers || []), ...(result.contributors || [])].map((d: Contributor) => ({
                id: d.id,
                title: d.label,
                url: d.evidence_link || "#",
                type: "other" as const,
                meta: `${d.value} (${d.delta_pct}%)`,
              }));

            // Deduplicate by id — drivers and contributors overlap
            const seen = new Set<string>();
            const evidence = rawEvidence.filter((item) => {
              if (seen.has(item.id)) return false;
              seen.add(item.id);
              return true;
            });

            const actions = result.actions || definition?.suggestedActions || [];

            const provenance: EvidenceProvenance = result.provenance || {
              last_sync: result.last_sync ?? null,
              source: result.source ?? "metrics API",
              identity_confidence: result.identity_confidence ?? null,
              quality: evidence.length > 0 ? "moderate" : "partial",
              partial: evidence.length === 0,
            };

            setData({
              ...result,
              summary:
                result.summary || `${result.label || title} is ${trend} by ${Math.abs(deltaPct)}%`,
              trend,
              magnitude,
              why_it_matters: result.why_it_matters || definition?.whyItMatters,
              evidence,
              actions,
              provenance,
            });
          }
        } catch (err) {
          logger.error({ err }, "Failed to load evidence data");
          setError("Failed to load evidence data");
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }
  }, [isOpen, apiUrl, metric, filters, title]);

  if (!isOpen) return null;

  const exploreUrl = apiUrl
    ? buildExploreUrl({ api: apiUrl, filters })
    : metric
      ? buildExploreUrl({ metric, filters })
      : "#";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 transition-opacity" onClick={onCloseAction} />

      <div className="relative z-10 flex h-full w-full flex-col rounded-l-3xl border-l border-(--card-stroke) bg-card shadow-2xl animate-in fade-in slide-in-from-right-4 duration-300 md:w-[520px]">
        <header className="flex items-center justify-between border-b border-(--card-stroke) bg-(--card-90) p-6">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-(--ink-muted)">
              Evidence & Context
            </p>
            <h2 className="text-lg font-semibold text-foreground mt-1">{title}</h2>
          </div>
          <button
            onClick={onCloseAction}
            className="rounded-full border border-(--card-stroke) p-2 text-xs uppercase tracking-widest text-(--ink-muted) transition-colors hover:bg-(--card-70) hover:text-foreground"
            title="Close panel"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-24 bg-(--card-70) rounded-2xl" />
              <div className="h-40 bg-(--card-70) rounded-2xl" />
              <div className="h-32 bg-(--card-70) rounded-2xl" />
            </div>
          ) : error ? (
            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          ) : data ? (
            <>
              <EvidenceProvenanceStrip provenance={data.provenance} />
              <EvidenceContext data={data} />
              {data.evidence?.length ? (
                <EvidenceItems items={data.evidence} />
              ) : (
                <div className="rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-90) p-4 text-sm leading-6 text-(--ink-muted)">
                  No contributing artifacts were returned for this metric and filter window. This is
                  a partial-data state, not a zero signal.
                </div>
              )}
              <SuggestedActions actions={data.actions || []} />
            </>
          ) : null}
        </div>

        <footer className="border-t border-(--card-stroke) bg-(--card-90) p-6">
          <Link
            href={exploreUrl}
            className="flex w-full items-center justify-center rounded-xl border border-(--accent)/20 bg-(--accent)/10 px-4 py-3 text-sm font-medium text-(--accent) transition-colors hover:bg-(--accent)/20"
          >
            Open in Explore View ↗
          </Link>
        </footer>
      </div>
    </div>
  );
}

function EvidenceProvenanceStrip({ provenance }: { provenance?: EvidenceProvenance }) {
  const confidence = provenance?.identity_confidence;

  return (
    <section className="grid gap-3 rounded-2xl border border-(--card-stroke) bg-(--card-90) p-4 text-xs text-(--ink-muted)">
      <p className="text-[10px] uppercase tracking-[0.2em]">Quality + provenance</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <EvidenceProvenanceItem label="Source" value={provenance?.source || "metrics API"} />
        <EvidenceProvenanceItem label="Quality" value={provenance?.quality || "partial"} />
        <EvidenceProvenanceItem label="Last sync" value={provenance?.last_sync || "not reported"} />
        <EvidenceProvenanceItem
          label="Identity confidence"
          value={
            typeof confidence === "number" ? `${Math.round(confidence * 100)}%` : "not reported"
          }
        />
      </div>
      {provenance?.partial && (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-amber-300">
          Partial evidence: the backend did not return a complete artifact list for this selection.
        </p>
      )}
    </section>
  );
}

function EvidenceProvenanceItem({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-xl border border-(--card-stroke) bg-background/35 px-3 py-2 leading-5">
      {label}: {value}
    </span>
  );
}
