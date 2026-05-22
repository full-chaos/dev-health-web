"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { BetaBadge } from "@/components/BetaBadge";
import { OrgSwitcher } from "@/components/navigation/OrgSwitcher";

import { withFilterParam } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";

const STORAGE_KEY = "devhealth-nav-collapsed";

const EMPTY_COLLAPSED: Record<string, boolean> = {};

let _cachedRaw: string | null = null;
let _cachedParsed: Record<string, boolean> = EMPTY_COLLAPSED;

function getCollapsedState(): Record<string, boolean> {
  if (typeof window === "undefined") return EMPTY_COLLAPSED;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === _cachedRaw) return _cachedParsed;
    _cachedRaw = raw;
    _cachedParsed = raw ? JSON.parse(raw) : EMPTY_COLLAPSED;
    return _cachedParsed;
  } catch {
    return EMPTY_COLLAPSED;
  }
}

function subscribeToStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getLocationHash() {
  if (typeof window === "undefined") return "";
  return window.location.hash;
}

type NavItem = {
  id: string;
  label: string;
  href: string;
  description?: string;
};

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
  placement: "main" | "utility";
};

/** Returns true if the group contains an item whose base path matches the current pathname. */
function groupContainsPath(group: NavGroup, pathname: string): boolean {
  return group.items.some((item) => {
    const itemPath = item.href.split("?")[0].split("#")[0];
    return pathname === itemPath || pathname.startsWith(itemPath + "/");
  });
}

// ── Navigation data ──────────────────────────────────────────────────────────

const navGroups: NavGroup[] = [
  // ── Main spine ──────────────────────────────────────────────────────────────
  {
    id: "cockpit",
    label: "Cockpit",
    placement: "main",
    items: [
      { id: "home", label: "Home", href: "/dashboard", description: "Overview" },
      {
        id: "operating-review",
        label: "Operating Review",
        href: "/operating-review",
        description: "Weekly",
      },
    ],
  },
  {
    id: "see-where-time-goes",
    label: "See Where Time Goes",
    placement: "main",
    items: [
      { id: "work", label: "Work", href: "/work", description: "Investment" },
      { id: "metrics", label: "Metrics", href: "/metrics?tab=dora", description: "Trends" },
      { id: "people", label: "People", href: "/people", description: "Individual" },
      { id: "landscape", label: "Landscape", href: "/explore/landscape", description: "Quadrants" },
      {
        id: "capacity-planning",
        label: "Capacity Planning",
        href: "/capacity-planning",
        description: "Forecast",
      },
      { id: "ai-impact", label: "AI Impact", href: "/ai/impact", description: "Leverage" },
    ],
  },
  {
    id: "spot-pressure-early",
    label: "Spot Pressure Early",
    placement: "main",
    items: [
      {
        id: "cognitive-load",
        label: "Cognitive Load",
        href: "/cognitive-load",
        description: "Focus",
      },
      { id: "bottleneck", label: "Bottlenecks", href: "/bottleneck", description: "WIP + review" },
      {
        id: "ai-review-load",
        label: "Review Load",
        href: "/ai/review-load",
        description: "Pressure",
      },
      { id: "code", label: "Code", href: "/code", description: "Ownership" },
      { id: "complexity", label: "Complexity", href: "/complexity", description: "Hotspots" },
      {
        id: "risk-compounding",
        label: "Compounding Risk",
        href: "/risk/compounding",
        description: "Composite",
      },
      {
        id: "opportunities",
        label: "Opportunities",
        href: "/opportunities",
        description: "Threads",
      },
      {
        id: "ai-opportunities",
        label: "Automations",
        href: "/ai/automations",
        description: "Candidates",
      },
    ],
  },
  {
    id: "improve-delivery-confidence",
    label: "Improve Delivery Confidence",
    placement: "main",
    items: [
      { id: "testops", label: "TestOps Overview", href: "/testops", description: "Health" },
      { id: "pipelines", label: "Pipelines", href: "/testops/pipelines", description: "CI/CD" },
      { id: "tests", label: "Tests", href: "/testops/tests", description: "Reliability" },
      { id: "quality", label: "Quality", href: "/quality", description: "Reliability" },
      { id: "coverage", label: "Coverage", href: "/testops/coverage", description: "Quality" },
      { id: "risk", label: "Delivery Risk", href: "/testops/risk", description: "Confidence" },
      {
        id: "incident-correlation",
        label: "Incident Correlation",
        href: "/incident-correlation",
        description: "Change failure",
      },
      { id: "security", label: "Security", href: "/security", description: "Alerts" },
      { id: "feature-flags", label: "Feature Flags", href: "/feature-flags", description: "Flags" },
      { id: "ai-risk", label: "AI Risk", href: "/ai/risk", description: "Quality" },
    ],
  },
  // ── Utility tray ────────────────────────────────────────────────────────────
  {
    id: "reports",
    label: "Reports",
    placement: "utility",
    items: [{ id: "reports", label: "Report Center", href: "/reports", description: "AI Reports" }],
  },
  {
    id: "admin",
    label: "Admin",
    placement: "utility",
    items: [{ id: "admin", label: "Settings", href: "/admin", description: "Settings" }],
  },
];

// ── Component ────────────────────────────────────────────────────────────────

type PrimaryNavProps = {
  filters: MetricFilter;
  active?: string;
  role?: string;
};

export function PrimaryNav({ filters, active, role }: PrimaryNavProps) {
  const pathname = usePathname();
  const [hash, setHash] = useState("");
  const collapsed = useSyncExternalStore(
    subscribeToStorage,
    getCollapsedState,
    () => EMPTY_COLLAPSED,
  );

  useEffect(() => {
    const syncHash = () => setHash(getLocationHash());
    syncHash();
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("popstate", syncHash);
    return () => {
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("popstate", syncHash);
    };
  }, []);

  /**
   * Toggle a group's collapsed state. Accepts the current effective collapsed
   * state so the stored value always reflects the user's intent, even when
   * the group was previously using a smart default.
   */
  const toggleGroup = useCallback((groupId: string, currentlyCollapsed: boolean) => {
    const current = getCollapsedState();
    const next = { ...current, [groupId]: !currentlyCollapsed };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    // Trigger storage event for useSyncExternalStore
    window.dispatchEvent(new Event("storage"));
  }, []);

  /**
   * Determine whether a group should be shown as collapsed.
   * Priority: explicit user preference (localStorage) → smart default.
   * Smart default: expand only Cockpit and the group containing the active route.
   */
  const isGroupCollapsed = useCallback(
    (group: NavGroup): boolean => {
      if (group.id in collapsed) return collapsed[group.id];
      // Smart default: expand cockpit and the active-route group
      const isDefaultExpanded = group.id === "cockpit" || groupContainsPath(group, pathname);
      return !isDefaultExpanded;
    },
    [collapsed, pathname],
  );

  const mainGroups = navGroups.filter((g) => g.placement === "main");
  const utilityGroups = navGroups.filter((g) => g.placement === "utility");

  const renderGroup = (group: NavGroup) => {
    const groupIsCollapsed = isGroupCollapsed(group);
    return (
      <div key={group.id}>
        <button
          onClick={() => toggleGroup(group.id, groupIsCollapsed)}
          className="primary-nav-group-button flex w-full items-center justify-between rounded-xl py-2 text-xs uppercase tracking-wider text-(--ink-muted) transition-colors hover:text-foreground"
        >
          <span>{group.label}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-200 ${groupIsCollapsed ? "-rotate-90" : "rotate-0"}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        <div
          className={`space-y-2 overflow-hidden transition-all duration-300 ${
            groupIsCollapsed ? "max-h-0 opacity-0" : "max-h-[600px] opacity-100"
          }`}
        >
          {group.items.map((item) => {
            const [itemPath, itemHash] = item.href.split("#", 2);
            const hashMatchesItem =
              Boolean(itemHash) && pathname === itemPath && hash === `#${itemHash}`;
            const pageMatchesItem = active === item.id && !(hash && pathname === itemPath);
            const isActive = hashMatchesItem || pageMatchesItem;
            return (
              <Link
                key={item.id}
                href={withFilterParam(item.href, filters, role)}
                onClick={itemHash ? () => setHash(`#${itemHash}`) : undefined}
                aria-current={isActive ? "page" : undefined}
                className={`group relative flex flex-col gap-0.5 rounded-2xl border px-3 py-2 transition ${
                  isActive
                    ? "border-(--accent) bg-(--accent)/15 text-foreground before:absolute before:left-0 before:top-1/4 before:h-1/2 before:w-[3px] before:rounded-full before:bg-(--accent)"
                    : "border-transparent bg-(--card-70) text-(--ink-muted) hover:border-(--card-stroke) hover:text-foreground"
                }`}
              >
                <span className="font-medium">{item.label}</span>
                {item.description && (
                  <span
                    className={`text-[10px] uppercase tracking-widest ${
                      isActive ? "text-(--accent)" : "text-(--ink-muted)"
                    }`}
                  >
                    {item.description}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <aside className="w-full md:max-w-[220px] md:shrink-0">
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

          {/* Main spine */}
          <nav className="mt-4 space-y-4 text-sm">
            {mainGroups.map((group) => renderGroup(group))}
          </nav>

          {/* Utility tray — visually separated from main spine */}
          <div className="mt-4 border-t border-(--card-stroke) pt-3 space-y-3 text-xs">
            {utilityGroups.map((group) => renderGroup(group))}
          </div>

          <div className="mt-4 rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) px-3 py-2 text-xs text-(--ink-muted)">
            Explore opens from evidence links only. Monitoring views show trends.
          </div>
        </div>
      </div>
    </aside>
  );
}
