"use client";

import { useEffect, useState } from "react";
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

export function InvestmentPreview({ filters }: InvestmentPreviewProps) {
  const [data, setData] = useState<InvestmentResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${API_BASE}/api/v1/investment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters }),
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload) {
          setData(payload as InvestmentResponse);
        }
      })
      .catch(() => null);

    return () => controller.abort();
  }, [filters]);

  if (!data) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-3xl border border-dashed border-[var(--card-stroke)] bg-[var(--card-60)] text-sm text-[var(--ink-muted)]">
        Loading investment mix…
      </div>
    );
  }

  const nested = mapInvestmentToNestedPie(data);

  return (
    <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-4">
      <NestedPieChart2D
        categories={nested.categories}
        subtypes={nested.subtypes}
        height={320}
      />
    </div>
  );
}
