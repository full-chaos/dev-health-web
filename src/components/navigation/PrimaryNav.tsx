"use client";

import Link from "next/link";
import { useSyncExternalStore, useCallback } from "react";
import { BetaBadge } from "@/components/BetaBadge";

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
    items: [{ id: "home", label: "Home", href: "/dashboard", description: "Overview" }],
  },
  {
    id: "observe",
    label: "Observe",
    items: [
      { id: "metrics", label: "Metrics", href: "/metrics?tab=dora", description: "Trends" },
      { id: "people", label: "People", href: "/people", description: "Individual" },
      { id: "landscape", label: "Landscape", href: "/explore/landscape", description: "Quadrants" },
    ],
  },
  {
    id: "investigate",
    label: "Investigate",
    items: [
      { id: "work", label: "Work", href: "/work", description: "Investment" },
      { id: "code", label: "Code", href: "/code", description: "Ownership" },
      { id: "opportunities", label: "Opportunities", href: "/opportunities", description: "Threads" },
    ],
  },
];

type PrimaryNavProps = {
  filters: MetricFilter;
  active?: string;
  role?: string;
};

export function PrimaryNav({ filters, active, role }: PrimaryNavProps) {
  const collapsed = useSyncExternalStore(
    subscribeToStorage,
    getCollapsedState,
    () => EMPTY_COLLAPSED
  );

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
        <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-(--ink-muted)">
              Dev Health Ops
            </p>
            <p className="mt-3 font-(--font-display) text-lg flex items-center gap-2">
              Cockpit <BetaBadge />
            </p>
            <p className="mt-2 text-xs text-(--ink-muted)">
              Observe patterns, drill into evidence.
            </p>
          </div>
          
          <nav className="mt-5 space-y-6 text-sm">
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
                    const isActive = active === item.id;
                    return (
                      <Link
                        key={item.id}
                        href={withFilterParam(item.href, filters, role)}
                        aria-current={isActive ? "page" : undefined}
                        className={`group flex items-center justify-between rounded-2xl border px-3 py-2 transition ${isActive
                          ? "border-(--accent) bg-(--accent)/15 text-foreground"
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
          
          <div className="mt-5 rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) px-3 py-3 text-xs text-(--ink-muted)">
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
