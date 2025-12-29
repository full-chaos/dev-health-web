"use client";

import Link from "next/link";

import type { MetricFilter } from "@/lib/filters/types";
import { buildExploreUrl } from "@/lib/filters/url";
import type { QuadrantPoint, QuadrantResponse } from "@/lib/types";

import { QuadrantChart } from "./QuadrantChart";

type QuadrantPanelProps = {
  title: string;
  description: string;
  data?: QuadrantResponse | null;
  filters: MetricFilter;
  relatedLinks?: Array<{ label: string; href: string }>;
  emptyState?: string;
};

export function QuadrantPanel({
  title,
  description,
  data,
  filters,
  relatedLinks,
  emptyState = "Quadrant data unavailable.",
}: QuadrantPanelProps) {
  const scopeType =
    filters.scope.level === "developer" ? "person" : filters.scope.level;
  const focusEntityIds = filters.scope.ids ?? [];

  const handlePointSelect = (point: QuadrantPoint) => {
    if (!point.evidence_link) {
      return;
    }
    const href = buildExploreUrl({ api: point.evidence_link, filters });
    window.location.href = href;
  };

  if (!data || !data.points?.length) {
    return (
      <div className="rounded-3xl border border-dashed border-[var(--card-stroke)] bg-[var(--card-70)] p-5 text-sm text-[var(--ink-muted)]">
        {emptyState}
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-[var(--font-display)] text-xl">{title}</h2>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">{description}</p>
        </div>
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
          Click a point for evidence
        </div>
      </div>
      <div className="mt-4">
        <QuadrantChart
          data={data}
          height={340}
          onPointSelect={handlePointSelect}
          focusEntityIds={focusEntityIds}
          scopeType={scopeType}
        />
      </div>
      <p className="mt-3 text-xs text-[var(--ink-muted)]">
        Unlabeled points = filtered cohort.
      </p>
      {relatedLinks?.length ? (
        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          {relatedLinks.map((link) => (
            <Link
              key={`${link.href}-${link.label}`}
              href={link.href}
              className="rounded-full border border-[var(--card-stroke)] bg-[var(--card-80)] px-3 py-1 uppercase tracking-[0.2em] text-[var(--accent-2)]"
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
