"use client";

import { NestedPieChart2D } from "@/components/charts/NestedPieChart2D";

type InvestmentChartProps = {
  categories: Array<{ key: string; name: string; value: number }>;
  subtypes: Array<{ name: string; value: number; parentKey: string }>;
};

export function InvestmentChart({ categories, subtypes }: InvestmentChartProps) {
  return (
    <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-5">
      <NestedPieChart2D categories={categories} subtypes={subtypes} height={360} />
    </div>
  );
}
