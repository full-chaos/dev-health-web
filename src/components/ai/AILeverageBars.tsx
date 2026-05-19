"use client";

import { VerticalBarChart } from "@/components/charts/VerticalBarChart";
import type { AiLeverageComponents } from "@/lib/graphql/__generated__/types";
import { leverageSeries } from "./utils";

export function AILeverageBars({ components }: { components?: AiLeverageComponents | null }) {
  const rows = leverageSeries(components);
  return (
    <div>
      <VerticalBarChart
        categories={rows.map((row) => row.label)}
        series={[{ name: "Contribution", data: rows.map((row) => row.value) }]}
        height={240}
      />
      <p className="mt-2 text-xs text-(--ink-muted)">
        Positive bars suggest lift; negative bars suggest drag in the current operating system.
      </p>
    </div>
  );
}
