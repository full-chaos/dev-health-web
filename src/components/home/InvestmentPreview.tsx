"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

import type { MetricFilter } from "@/lib/filters/types";
import type { InvestmentResponse } from "@/lib/types";
import { mapInvestmentToNestedPie } from "@/lib/mappers";

const NestedPieChart2D = dynamic(
  () => import("@/components/charts/NestedPieChart2D").then((mod) => mod.NestedPieChart2D),
  { ssr: false }
);

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

type InvestmentPreviewProps = {
  filters: MetricFilter;
};

function LoadingState() {
  return (
    <div className="flex h-[320px] flex-col items-center justify-center rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-60)">
      <div className="mb-4 flex gap-1">
        <span className="h-2 w-2 animate-pulse rounded-full bg-(--accent)" style={{ animationDelay: "0ms" }} />
        <span className="h-2 w-2 animate-pulse rounded-full bg-(--accent)" style={{ animationDelay: "150ms" }} />
        <span className="h-2 w-2 animate-pulse rounded-full bg-(--accent)" style={{ animationDelay: "300ms" }} />
      </div>
      <span className="text-sm text-(--ink-muted)">Loading investment mix…</span>
    </div>
  );
}

// Generate a stable key from filters for tracking data freshness
const getFiltersKey = (filters: MetricFilter) =>
  JSON.stringify({
    scope: filters.scope,
    time: filters.time,
  });

type DataState = {
  data: InvestmentResponse | null;
  filtersKey: string;
};

export function InvestmentPreview({ filters }: InvestmentPreviewProps) {
  const [state, setState] = useState<DataState>({
    data: null,
    filtersKey: "",
  });

  const currentFiltersKey = useMemo(() => getFiltersKey(filters), [filters]);

  // Compute loading state: we're loading if filtersKey doesn't match current filters
  const isLoading = state.filtersKey !== currentFiltersKey;

  useEffect(() => {
    const controller = new AbortController();
    const filtersKey = getFiltersKey(filters);

    fetch(`${API_BASE}/api/v1/investment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters }),
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload) {
          setState({ data: payload as InvestmentResponse, filtersKey });
        }
      })
      .catch(() => null);

    return () => controller.abort();
  }, [filters]);

  if (isLoading || !state.data) {
    return <LoadingState />;
  }

  const nested = mapInvestmentToNestedPie(state.data);

  return (
    <div className="rounded-3xl border border-(--card-stroke) bg-card p-4">
      <NestedPieChart2D
        categories={nested.categories}
        subtypes={nested.subtypes}
        height={320}
      />
    </div>
  );
}
