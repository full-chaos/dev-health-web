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

function splitHref(href: string): { path: string; hash: string } {
  const [withoutHash, hash = ""] = href.split("#", 2);
  return {
    path: withoutHash.split("?")[0] || "/",
    hash: hash ? `#${hash}` : "",
  };
}

function pathnameMatchesItem(pathname: string, itemPath: string): boolean {
  return pathname === itemPath || pathname.startsWith(itemPath + "/");
}

function selectedItemIdForPathname(
  groups: NavGroup[],
  pathname: string,
  hash: string,
  fallbackActive?: string,
): string | undefined {
  let selectedItemId: string | undefined;
  let selectedScore = -1;
  let fallbackItemId: string | undefined;

  for (const group of groups) {
    for (const item of group.items) {
      const { path: itemPath, hash: itemHash } = splitHref(item.href);

      if (fallbackActive === item.id) fallbackItemId = item.id;

      if (itemHash) {
        if (pathname === itemPath && hash === itemHash) {
          const score = itemPath.length + itemHash.length;
          if (score > selectedScore) {
            selectedItemId = item.id;
            selectedScore = score;
          }
        }
        continue;
      }

      if (pathnameMatchesItem(pathname, itemPath) && itemPath.length > selectedScore) {
        selectedItemId = item.id;
        selectedScore = itemPath.length;
      }
    }
  }

  return selectedItemId ?? fallbackItemId;
}

// ── Navigation data ──────────────────────────────────────────────────────────

const navGroups: NavGroup[] = [
  // ── Main spine ──────────────────────────────────────────────────────────────
  {
    id: "cockpit",
    label: "Cockpit",
    placement: "main",
    items: [
      { id: "home", label: "Home", href: "/dashboard" },
      {
        id: "operating-review",
        label: "Operating Review",
        href: "/operating-review",
      },
    ],
  },
  {
    id: "diagnose",
    label: "Diagnose",
    placement: "main",
    items: [
      { id: "work", label: "Work", href: "/work" },
      { id: "metrics", label: "Metrics", href: "/metrics?tab=dora" },
      { id: "people", label: "People", href: "/people" },
      { id: "code", label: "Code", href: "/code" },
      { id: "landscape", label: "Landscape", href: "/explore/landscape" },
      { id: "complexity", label: "Complexity", href: "/complexity" },
      {
        id: "cognitive-load",
        label: "Cognitive Load",
        href: "/cognitive-load",
      },
      { id: "bottleneck", label: "Bottlenecks", href: "/bottleneck" },
    ],
  },
  {
    id: "improve",
    label: "Improve",
    placement: "main",
    items: [
      { id: "opportunities", label: "Opportunities", href: "/opportunities" },
      {
        id: "capacity-planning",
        label: "Capacity Planning",
        href: "/capacity-planning",
      },
      // Single AI nav slot — the /ai tabbed workspace is owned by the AI-unification issue.
      { id: "ai-workflows", label: "AI Workflows", href: "/ai" },
    ],
  },
  {
    id: "govern",
    label: "Govern",
    placement: "main",
    items: [
      { id: "testops", label: "TestOps", href: "/testops" },
      { id: "pipelines", label: "Pipelines", href: "/testops/pipelines" },
      { id: "tests", label: "Tests", href: "/testops/tests" },
      { id: "quality", label: "Quality", href: "/quality" },
      { id: "coverage", label: "Coverage", href: "/testops/coverage" },
      { id: "risk", label: "Delivery Risk", href: "/testops/risk" },
      {
        id: "incident-correlation",
        label: "Incident Correlation",
        href: "/incident-correlation",
      },
      { id: "security", label: "Security", href: "/security" },
      { id: "feature-flags", label: "Feature Flags", href: "/feature-flags" },
      {
        id: "risk-compounding",
        label: "Compounding Risk",
        href: "/risk/compounding",
      },
    ],
  },
  // ── Utility tray ────────────────────────────────────────────────────────────
  {
    id: "reports",
    label: "Reports",
    placement: "utility",
    items: [{ id: "reports", label: "Report Center", href: "/reports" }],
  },
  {
    id: "admin",
    label: "Admin",
    placement: "utility",
    items: [{ id: "admin", label: "Settings", href: "/admin" }],
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
  const selectedItemId = selectedItemIdForPathname(navGroups, pathname, hash, active);

  const renderGroup = (group: NavGroup) => {
    const groupIsCollapsed = isGroupCollapsed(group);
    return (
      <div key={group.id}>
        <button
          type="button"
          onClick={() => toggleGroup(group.id, groupIsCollapsed)}
          className="primary-nav-group-button flex w-full items-center justify-between rounded-xl py-2 text-xs uppercase tracking-wider text-(--ink-muted) transition-colors hover:text-foreground"
        >
          <span>{group.label}</span>
          <svg
            aria-hidden="true"
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
            groupIsCollapsed ? "max-h-0 opacity-0" : "max-h-[1200px] opacity-100"
          }`}
        >
          {group.items.map((item) => {
            const [, itemHash] = item.href.split("#", 2);
            const isActive = selectedItemId === item.id;
            return (
              <Link
                key={item.id}
                href={withFilterParam(item.href, filters, role)}
                onClick={itemHash ? () => setHash(`#${itemHash}`) : undefined}
                aria-current={isActive ? "page" : undefined}
                className={`group relative flex flex-col gap-0.5 rounded-2xl border px-3 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/35 ${
                  isActive
                    ? "border-(--accent) bg-(--accent)/15 text-foreground before:absolute before:left-0 before:top-1/4 before:h-1/2 before:w-[3px] before:rounded-full before:bg-(--accent)"
                    : "border-transparent bg-(--card-70) text-(--ink-muted) hover:border-(--card-stroke) hover:bg-(--card-80) hover:text-foreground focus-visible:border-(--card-stroke) focus-visible:bg-(--card-80) focus-visible:text-foreground"
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
