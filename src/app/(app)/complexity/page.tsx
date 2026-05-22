/**
 * /complexity — Complexity Trends surface (CHAOS-1745).
 *
 * RSC entry. Pre-fetches complexityTimeseries + hotspots via GraphQL (CHAOS-1756)
 * and renders ComplexityDashboard with KPI tiles, trend chart, hotspot treemap,
 * and drilldown table.
 *
 * Default window: last 90 days; granularity: WEEK; scope: REPO; limit: 10 repos,
 * 50 hotspot rows.
 */

import Link from "next/link";

import { ContextStrip } from "@/components/navigation/ContextStrip";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ComplexityDashboard } from "@/components/complexity/ComplexityDashboard";
import type {
  ComplexityPoint,
  HotspotRow,
} from "@/components/complexity/ComplexityDashboard";
import { requireSession } from "@/lib/auth";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { graphqlFetch } from "@/lib/graphql/server";
import {
  COMPLEXITY_TIMESERIES_QUERY,
  HOTSPOTS_QUERY,
} from "@/lib/graphql/queries";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

type ComplexityTimeseriesResponse = {
  complexityTimeseries: {
    points: ComplexityPoint[];
    totalScope: number;
  };
};

type HotspotsResponse = {
  hotspots: {
    rows: HotspotRow[];
  };
};

// ---------------------------------------------------------------------------
// Data-fetching helpers
// ---------------------------------------------------------------------------

async function fetchComplexityTimeseries(
  orgId: string,
  sinceUtc: string,
  untilUtc: string,
): Promise<ComplexityPoint[]> {
  try {
    const data = await graphqlFetch<ComplexityTimeseriesResponse>(
      COMPLEXITY_TIMESERIES_QUERY,
      {
        input: {
          orgId,
          sinceUtc,
          untilUtc,
          granularity: "WEEK",
          scope: "REPO",
          limit: 10,
        },
      },
      { orgId },
    );
    return data.complexityTimeseries?.points ?? [];
  } catch (err) {
    // Surface as empty state rather than crashing — the dashboard owns the UX.
    console.warn("complexityTimeseries query failed", err);
    return [];
  }
}

async function fetchHotspots(
  orgId: string,
  sinceUtc: string,
  untilUtc: string,
): Promise<HotspotRow[]> {
  try {
    const data = await graphqlFetch<HotspotsResponse>(
      HOTSPOTS_QUERY,
      {
        input: {
          orgId,
          sinceUtc,
          untilUtc,
          limit: 50,
        },
      },
      { orgId },
    );
    return data.hotspots?.rows ?? [];
  } catch (err) {
    console.warn("hotspots query failed", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ComplexityPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const params = (await searchParams) ?? {};

  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
  const originParam = Array.isArray(params.origin)
    ? params.origin[0]
    : params.origin;

  const activeRole = typeof roleParam === "string" ? roleParam : undefined;
  const activeOrigin =
    typeof originParam === "string" ? originParam : undefined;

  const filters = encodedFilter
    ? decodeFilter(encodedFilter)
    : filterFromQueryParams(params);

  const orgId = session.user?.org_id ?? "demo-org";

  // Default 90-day window
  const until = new Date();
  const since = new Date(until);
  since.setDate(since.getDate() - 90);
  const untilUtc = until.toISOString();
  const sinceUtc = since.toISOString();

  // Parallel pre-fetch — both queries are independent
  const [points, hotspotRows] = await Promise.all([
    fetchComplexityTimeseries(orgId, sinceUtc, untilUtc),
    fetchHotspots(orgId, sinceUtc, untilUtc),
  ]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="complexity" role={activeRole} />
        <main
          className="flex min-w-0 flex-1 flex-col gap-8"
          data-testid="complexity-page"
        >
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                Investigate
              </p>
              <h1 className="mt-2 font-(--font-display) text-3xl">
                Complexity Trends
              </h1>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Code complexity over time, file hotspots, and high-risk areas.
              </p>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Every score traces to cyclomatic complexity and churn evidence.
              </p>
            </div>
            <Link
              href={withFilterParam("/", filters, activeRole)}
              className="rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em]"
            >
              Back to cockpit
            </Link>
          </header>

          <ContextStrip filters={filters} origin={activeOrigin} />

          <ComplexityDashboard
            orgId={orgId}
            points={points}
            hotspotRows={hotspotRows}
          />
        </main>
      </div>
    </div>
  );
}
