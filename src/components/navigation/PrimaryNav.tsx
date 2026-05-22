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
  description: string;
};

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    id: "cockpit",
    label: "Cockpit",
    items: [
      { id: "home", label: "Home", href: "/dashboard", description: "Overview" },
      { id: "operating-review", label: "Operating Review", href: "/operating-review", description: "Weekly" },
    ],
  },
  {
    id: "observe",
    label: "Observe",
    items: [
      { id: "metrics", label: "Metrics", href: "/metrics?tab=dora", description: "Trends" },
      { id: "people", label: "People", href: "/people", description: "Individual" },
      { id: "cognitive-load", label: "Cognitive Load", href: "/cognitive-load", description: "Focus" },
      { id: "landscape", label: "Landscape", href: "/explore/landscape", description: "Quadrants" },
    ],
  },
  {
    id: "investigate",
    label: "Investigate",
    items: [
      { id: "work", label: "Work", href: "/work", description: "Investment" },
      { id: "bottleneck", label: "Bottlenecks", href: "/bottleneck", description: "WIP + review" },
      { id: "capacity-planning", label: "Capacity Planning", href: "/capacity-planning", description: "Forecast" },
      { id: "code", label: "Code", href: "/code", description: "Ownership" },
      { id: "risk-compounding", label: "Compounding Risk", href: "/risk/compounding", description: "Composite" },
      { id: "incident-correlation", label: "Incident Correlation", href: "/incident-correlation", description: "DORA change-failure" },
      { id: "complexity", label: "Complexity", href: "/complexity", description: "Hotspots + trend" },
      { id: "opportunities", label: "Opportunities", href: "/opportunities", description: "Threads" },
      { id: "security", label: "Security", href: "/security", description: "Alerts" },
    ],
  },
  {
    id: "testops",
    label: "TestOps",
    items: [
      { id: "testops", label: "Overview", href: "/testops", description: "Health" },
      { id: "pipelines", label: "Pipelines", href: "/testops/pipelines", description: "CI/CD" },
      { id: "tests", label: "Tests", href: "/testops/tests", description: "Reliability" },
      { id: "coverage", label: "Coverage", href: "/testops/coverage", description: "Quality" },
      { id: "risk", label: "Risk", href: "/testops/risk", description: "Confidence" },
    ],
  },
  {
    id: "feature-flags",
    label: "Feature Flags",
    items: [
      { id: "feature-flags", label: "Overview", href: "/feature-flags", description: "Flags" },
    ],
  },
  {
    id: "ai",
    label: "AI",
    items: [
      { id: "ai-impact", label: "Impact", href: "/ai/impact", description: "Leverage" },
      { id: "ai-review-load", label: "Review Load", href: "/ai/review-load", description: "Pressure" },
      { id: "ai-risk", label: "Risk", href: "/ai/risk", description: "Quality" },
      { id: "ai-opportunities", label: "Automations", href: "/ai/automations", description: "Candidates" },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    items: [
      { id: "reports", label: "Report Center", href: "/reports", description: "AI Reports" },
    ],
  },
];

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
    () => EMPTY_COLLAPSED
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

  const toggleGroup = useCallback((groupId: string) => {
    const current = getCollapsedState();
    const next = { ...current, [groupId]: !current[groupId] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    // Trigger storage event for useSyncExternalStore
    window.dispatchEvent(new Event("storage"));
  }, []);

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

          <nav className="mt-4 space-y-4 text-sm">
            {navGroups.map((group) => (
              <div key={group.id}>
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="flex w-full items-center justify-between py-2 text-xs uppercase tracking-wider text-(--ink-muted) hover:text-foreground transition-colors"
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
                    className={`transition-transform duration-200 ${collapsed[group.id] ? "-rotate-90" : "rotate-0"}`}
                  >
                    <path d="m6 9 6 6 6-6"/>
                  </svg>
                </button>
                
                <div className={`space-y-2 overflow-hidden transition-all duration-300 ${collapsed[group.id] ? "max-h-0 opacity-0" : "max-h-[500px] opacity-100"}`}>
                  {group.items.map((item) => {
                    const [itemPath, itemHash] = item.href.split("#", 2);
                    const hashMatchesItem = Boolean(itemHash) && pathname === itemPath && hash === `#${itemHash}`;
                    const pageMatchesItem = active === item.id && !(hash && pathname === itemPath);
                    const isActive = hashMatchesItem || pageMatchesItem;
                    return (
                      <Link
                        key={item.id}
                        href={withFilterParam(item.href, filters, role)}
                        onClick={itemHash ? () => setHash(`#${itemHash}`) : undefined}
                        aria-current={isActive ? "page" : undefined}
                        className={`group relative flex items-center justify-between rounded-2xl border px-3 py-2 transition ${isActive
                          ? "border-(--accent) bg-(--accent)/15 text-foreground before:absolute before:left-0 before:top-1/4 before:h-1/2 before:w-[3px] before:rounded-full before:bg-(--accent)"
                          : "border-transparent bg-(--card-70) text-(--ink-muted) hover:border-(--card-stroke) hover:text-foreground"
                          }`}
                      >
                        <span className="font-medium">{item.label}</span>
                        <span
                          className={`text-[10px] uppercase tracking-widest ${isActive
                            ? "text-(--accent)"
                            : "text-(--ink-muted)"
                            }`}
                        >
                          {item.description}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          
          <div className="mt-4 rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) px-3 py-2 text-xs text-(--ink-muted)">
            Explore opens from evidence links only. Monitoring views show trends.
          </div>
          <div className="mt-3">
            <Link
              href="/admin"
              className="flex items-center justify-between rounded-2xl border border-transparent bg-(--card-70) px-3 py-2 text-sm text-(--ink-muted) hover:border-(--card-stroke) hover:text-foreground transition"
            >
              <span className="font-medium">Admin</span>
              <span className="text-[10px] uppercase tracking-widest">Settings</span>
            </Link>
          </div>
        </div>
      </div>
    </aside>
  );
}
