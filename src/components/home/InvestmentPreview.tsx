"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

import type { MetricFilter } from "@/lib/filters/types";
import type { InvestmentResponse } from "@/lib/types";
import { apiClient } from "@/lib/apiClient";
import { normalizeInvestmentMix } from "@/lib/investmentMix";
import { runtimeConfig } from "@/lib/runtimeConfig";
import { investmentMixSample } from "@/data/devHealthOpsSample";

const InvestmentMixSunburst = dynamic(
  () => import("@/components/charts/InvestmentMixSunburst").then((mod) => mod.InvestmentMixSunburst),
  { ssr: false }
);

// Consistent height for both loading and loaded states
const CHART_HEIGHT = 320;

type InvestmentPreviewProps = {
  filters: MetricFilter;
};

function LoadingState() {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-60)"
      style={{ height: CHART_HEIGHT }}
    >
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
  const useSampleData = runtimeConfig.devHealthTestMode();

  const currentFiltersKey = useMemo(() => getFiltersKey(filters), [filters]);

  const data = useSampleData ? investmentMixSample : state.data;

  // Compute loading state: we're loading if filtersKey doesn't match current filters
  const isLoading = useSampleData ? false : state.filtersKey !== currentFiltersKey;

  useEffect(() => {
    if (useSampleData) {
      return;
    }
    const controller = new AbortController();

    apiClient
      .postJson<InvestmentResponse>(
        "/api/v1/investment",
        { filters },
        { signal: controller.signal }
      )
      .then((payload) => {
        if (payload) {
          setState({ data: payload, filtersKey: currentFiltersKey });
        }
      })
      .catch(() => null);

    return () => controller.abort();
  }, [filters, currentFiltersKey, useSampleData]);

  if (isLoading || !data) {
    return <LoadingState />;
  }

  const mix = normalizeInvestmentMix(data);

  return (
    <div className="rounded-3xl border border-(--card-stroke) bg-card p-4">
      <InvestmentMixSunburst
        themeDistribution={mix.theme_distribution}
        subcategoryDistribution={mix.subcategory_distribution}
        evidenceQualityDistribution={mix.evidence_quality_distribution}
        unit={mix.unit ?? "units"}
        height={CHART_HEIGHT}
      />
    </div>
  );
}
