import Link from "next/link";

import { withFilterParam } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";
import { getAreaById, type NavAreaId } from "@/lib/navigation/areas";

// ── AreaHub ──────────────────────────────────────────────────────────────────
//
// Renders an area's leaf destinations as a drill-down card grid on the area's
// landing page (Framework A2: leaves live in area tabs/drill-down, not the
// sidebar). Reads its items from the central nav config so the sidebar, active
// state, and landing drill-downs can never drift apart (CHAOS-2073).

type AreaHubProps = {
  areaId: NavAreaId;
  filters: MetricFilter;
  role?: string;
  /** Eyebrow label above the grid. Defaults to "<Area> area". */
  title?: string;
  /** Optional one-line description under the eyebrow. */
  description?: string;
};

export function AreaHub({ areaId, filters, role, title, description }: AreaHubProps) {
  const area = getAreaById(areaId);
  if (!area || area.hubItems.length === 0) return null;

  return (
    <section
      aria-label={`${area.label} destinations`}
      className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5"
    >
      <div>
        <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
          {title ?? `${area.label} area`}
        </p>
        {description ? <p className="mt-1 text-sm text-(--ink-muted)">{description}</p> : null}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {area.hubItems.map((item) => (
          <Link
            key={item.id}
            href={withFilterParam(item.href, filters, role)}
            className="group rounded-2xl border border-(--card-stroke) bg-(--card) px-4 py-3 transition hover:-translate-y-1 hover:border-(--accent)"
          >
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
              <span>{item.label}</span>
              <span className="text-(--accent-2)">Open</span>
            </div>
            {item.description ? (
              <p className="mt-2 text-sm text-(--ink-muted)">{item.description}</p>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}
