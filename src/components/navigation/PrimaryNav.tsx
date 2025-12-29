import Link from "next/link";

import { withFilterParam } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";

type NavItem = {
  id: string;
  label: string;
  href: string;
  description: string;
};

const navItems: NavItem[] = [
  { id: "home", label: "Home", href: "/", description: "Cockpit" },
  { id: "people", label: "People", href: "/people", description: "Individual" },
  { id: "metrics", label: "Metrics", href: "/metrics?tab=dora", description: "Monitor" },
  { id: "landscape", label: "Landscape", href: "/explore/landscape", description: "Quadrants" },
  { id: "work", label: "Work", href: "/work", description: "Investment" },
  { id: "code", label: "Code", href: "/code", description: "Signals" },
  { id: "quality", label: "Quality", href: "/quality", description: "Reliability" },
  { id: "opportunities", label: "Opportunities", href: "/opportunities", description: "Actions" },
];

type PrimaryNavProps = {
  filters: MetricFilter;
  active?: string;
};

export function PrimaryNav({ filters, active }: PrimaryNavProps) {
  return (
    <aside className="w-full md:max-w-[220px] md:shrink-0">
      <div className="md:sticky md:top-6">
        <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-5">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)]">
              Dev Health Ops
            </p>
            <p className="mt-3 font-[var(--font-display)] text-lg">
              Control Room
            </p>
            <p className="mt-2 text-xs text-[var(--ink-muted)]">
              Monitor signal, drill into evidence.
            </p>
          </div>
          <nav className="mt-5 space-y-2 text-sm">
            {navItems.map((item) => {
              const isActive = active === item.id;
              return (
                <Link
                  key={item.id}
                  href={withFilterParam(item.href, filters)}
                  aria-current={isActive ? "page" : undefined}
                  className={`group flex items-center justify-between rounded-2xl border px-3 py-2 transition ${
                    isActive
                      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--foreground)]"
                      : "border-transparent bg-[var(--card-70)] text-[var(--ink-muted)] hover:border-[var(--card-stroke)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <span className="font-medium">{item.label}</span>
                  <span
                    className={`text-[10px] uppercase tracking-[0.3em] ${
                      isActive
                        ? "text-[var(--accent)]"
                        : "text-[var(--ink-muted)]"
                    }`}
                  >
                    {item.description}
                  </span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-5 rounded-2xl border border-dashed border-[var(--card-stroke)] bg-[var(--card-70)] px-3 py-3 text-xs text-[var(--ink-muted)]">
            Explore opens from evidence links only. Use monitoring views for trends.
          </div>
        </div>
      </div>
    </aside>
  );
}
