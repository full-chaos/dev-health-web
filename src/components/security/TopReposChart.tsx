"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Chart } from "@/components/charts/Chart";
import { useChartTheme } from "@/components/charts/chartTheme";
import { SkeletonLine } from "@/components/ui/Skeleton";
import type { RepoAlertCountData } from "./types";
import { buildRepoHref } from "./repoLink";

type TopReposChartProps = {
  repos: RepoAlertCountData[];
  loading?: boolean;
};

export function TopReposChart({ repos, loading }: TopReposChartProps) {
  const chartTheme = useChartTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const f = searchParams.get("f") ?? undefined;

  // Sort descending by count.
  const sorted = useMemo(() => [...repos].sort((a, b) => b.count - a.count), [repos]);

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: "axis" as const,
        confine: true,
        backgroundColor: chartTheme.background,
        borderColor: chartTheme.stroke,
        textStyle: { color: chartTheme.text },
      },
      grid: { left: 120, right: 24, top: 20, bottom: 20 },
      xAxis: {
        type: "value" as const,
        splitLine: { lineStyle: { color: chartTheme.grid } },
        axisLabel: { color: chartTheme.muted },
      },
      yAxis: {
        type: "category" as const,
        data: sorted.map((r) => r.repoName),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: chartTheme.grid } },
        axisLabel: { color: chartTheme.muted },
      },
      series: [
        {
          type: "bar" as const,
          barMaxWidth: 18,
          label: {
            show: true,
            position: "right" as const,
            color: chartTheme.muted,
          },
          itemStyle: { cursor: "pointer" } as Record<string, unknown>,
          data: sorted.map((r) => r.count),
        },
      ],
    }),
    [sorted, chartTheme],
  );

  if (loading) {
    return <SkeletonLine height="h-48" />;
  }

  if (sorted.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--ink-muted)]">No repos with alerts</p>;
  }

  // Each bar row navigates to /security/repos/[repoId].
  // Visual (mouse) clicks are handled by the ECharts click event wired to
  // router.push via the onEvents prop below. A visually-hidden <ul> of Next.js
  // <Link>s provides equivalent keyboard / screen-reader navigation.
  return (
    <div className="relative">
      <Chart
        option={option}
        style={{ height: Math.max(180, sorted.length * 36 + 40), width: "100%" }}
        chartTheme={chartTheme}
        onEvents={{
          click: (params: unknown) => {
            const p = params as { dataIndex?: number; componentType?: string } | null;
            if (p?.componentType !== "series") return;
            const dataIndex = p?.dataIndex;
            if (typeof dataIndex === "number") {
              const repo = sorted[dataIndex];
              if (repo?.repoId) {
                router.push(buildRepoHref(repo.repoId, f));
              }
            }
          },
        }}
      />
      {/* Accessible link list — visually hidden, screen-reader + keyboard friendly */}
      <ul className="sr-only">
        {sorted.map((repo) => (
          <li key={repo.repoId}>
            <Link href={buildRepoHref(repo.repoId, f)}>
              {repo.repoName} — {repo.count} alerts
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
