"use client";

import { usePathname } from "next/navigation";

import { ModeTabs, type ModeTabItem } from "@/components/shared/ModeTabs";
import type { MetricFilter } from "@/lib/filters/types";
import { withFilterParam } from "@/lib/filters/url";

/**
 * Route-based tab strip for the Tests · Quality · Coverage cluster (CHAOS-2075
 * Phase 2). These three surfaces live at separate route roots, so a shared
 * Next.js layout cannot wrap them. This client component resolves the active
 * tab from `usePathname()` and renders `ModeTabs` — the single underline-idiom
 * tab primitive (Framework A2) — so the three pages feel like sibling views of
 * one area.
 *
 * Pipelines is deliberately excluded: it is a standalone sidebar row, not part
 * of this cluster.
 */

export type QualityCoverageTabId = "tests" | "quality" | "coverage";

type QualityCoverageTab = {
  id: QualityCoverageTabId;
  label: string;
  href: string;
};

const QUALITY_COVERAGE_TABS: QualityCoverageTab[] = [
  { id: "tests", label: "Tests", href: "/testops/tests" },
  { id: "quality", label: "Quality", href: "/quality" },
  { id: "coverage", label: "Coverage", href: "/testops/coverage" },
];

/**
 * Resolve the active tab from the current pathname.
 *
 * Longest-prefix match: `/testops/tests` owns anything under `/testops/tests/`;
 * `/testops/coverage` owns anything under `/testops/coverage/`; `/quality`
 * owns anything under `/quality/`. Falls back to "coverage" (the cluster's
 * canonical landing path) when no tab matches.
 */
export function activeTabFromPath(pathname: string): QualityCoverageTabId {
  for (const tab of QUALITY_COVERAGE_TABS) {
    if (pathname === tab.href || pathname.startsWith(tab.href + "/")) {
      return tab.id;
    }
  }
  return "coverage";
}

type QualityCoverageTabsProps = {
  filters: MetricFilter;
  role?: string;
};

/**
 * Renders the Tests · Quality · Coverage cluster tab strip.
 *
 * Drop this near the top of the page `<main>` body on each of the three
 * cluster pages, after the page header and before page-specific content.
 * Pass `filters` and `role` from the page so that active filter/role query
 * params are preserved when switching between cluster tabs (matches the
 * `withFilterParam` convention used by all other ModeTabs in the app).
 */
export function QualityCoverageTabs({ filters, role }: QualityCoverageTabsProps) {
  const pathname = usePathname();
  const activeTab = activeTabFromPath(pathname);

  const items: ModeTabItem<QualityCoverageTabId>[] = QUALITY_COVERAGE_TABS.map((tab) => ({
    id: tab.id,
    label: tab.label,
    href: withFilterParam(tab.href, filters, role),
  }));

  return (
    <ModeTabs items={items} activeId={activeTab} ariaLabel="Tests, Quality, and Coverage" />
  );
}
