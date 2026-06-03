"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BetaBadge } from "@/components/BetaBadge";
import { OrgSwitcher } from "@/components/navigation/OrgSwitcher";

import { withFilterParam } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";
import { navAreas, selectedAreaIdForPathname, type NavArea } from "@/lib/navigation/areas";

// ── Component ────────────────────────────────────────────────────────────────
//
// CHAOS-2073: the sidebar surfaces the six decision areas only (Framework A1).
// Leaf/metric destinations are NOT listed here — they live on each area's
// landing page via `AreaHub` (Framework A2). The nav config is the single
// source of truth (`@/lib/navigation/areas`).

type PrimaryNavProps = {
  filters: MetricFilter;
  active?: string;
  role?: string;
};

export function PrimaryNav({ filters, active, role }: PrimaryNavProps) {
  const pathname = usePathname();
  const selectedAreaId = selectedAreaIdForPathname(navAreas, pathname, active);

  const mainAreas = navAreas.filter((area) => area.placement === "main");
  const utilityAreas = navAreas.filter((area) => area.placement === "utility");

  const renderArea = (area: NavArea) => {
    const isActive = selectedAreaId === area.id;
    return (
      <Link
        key={area.id}
        href={withFilterParam(area.href, filters, role)}
        aria-current={isActive ? "page" : undefined}
        className={`group relative flex items-center rounded-2xl border px-3 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/35 ${
          isActive
            ? "border-(--accent) bg-(--accent)/15 text-foreground before:absolute before:left-0 before:top-1/4 before:h-1/2 before:w-[3px] before:rounded-full before:bg-(--accent)"
            : "border-transparent bg-(--card-70) text-(--ink-muted) hover:border-(--card-stroke) hover:bg-(--card-80) hover:text-foreground focus-visible:border-(--card-stroke) focus-visible:bg-(--card-80) focus-visible:text-foreground"
        }`}
      >
        <span className="font-medium">{area.label}</span>
      </Link>
    );
  };

  return (
    <aside className="w-full md:max-w-56 md:shrink-0">
      <div className="md:sticky md:top-6">
        <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-4">
          <div>
            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
              Full Chaos Dev Health Ops
            </p>
            <p className="mt-2 font-(--font-display) text-lg font-semibold flex items-center gap-2">
              Cockpit <BetaBadge />
            </p>
            <p className="mt-1 text-xs text-(--ink-muted)">
              Observe patterns, drill into evidence.
            </p>
          </div>

          <OrgSwitcher />

          {/* Main spine — decision areas only (A1). Leaves live on area landings (A2). */}
          <nav className="mt-4 space-y-2 text-sm" aria-label="Primary areas">
            {mainAreas.map((area) => renderArea(area))}
          </nav>

          {/* Utility tray — visually separated from main spine */}
          <div className="mt-4 border-t border-(--card-stroke) pt-3 space-y-2 text-xs">
            {utilityAreas.map((area) => renderArea(area))}
          </div>

          <div className="mt-4 rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) px-3 py-2 text-xs text-(--ink-muted)">
            Each area opens a landing page; drill into metrics from there.
          </div>
        </div>
      </div>
    </aside>
  );
}
