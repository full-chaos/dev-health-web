"use client";

import { NestedPieChart2D } from "@/components/charts/NestedPieChart2D";

type InvestmentChartProps = {
  categories: Array<{ key: string; name: string; value: number }>;
  subtypes: Array<{ name: string; value: number; parentKey: string }>;
  unit?: string;
};

export function InvestmentChart({ categories, subtypes, unit }: InvestmentChartProps) {
  return (
    <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
      <NestedPieChart2D categories={categories} subtypes={subtypes} unit={unit} height={360} />
    </div>
  );
}
