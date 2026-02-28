import Link from "next/link";

import { UpgradeGate } from "@/components/billing/UpgradeGate";
import { FilterBar } from "@/components/filters/FilterBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { CapacityView } from "@/components/work/CapacityView";
import { checkApiHealth } from "@/lib/api";
import { getCurrentOrg, getOrgEntitlements } from "@/lib/admin/server";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { ContextStrip } from "@/components/navigation/ContextStrip";

type CapacityPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function CapacityPage({ searchParams }: CapacityPageProps) {
  const health = await checkApiHealth();
  if (!health.ok) {
    return <ServiceUnavailable />;
  }

  const orgResult = await fetchOrNull(getCurrentOrg(), "capacity/org");
  const org = orgResult?.data;
  const entitlements = org?.id
    ? await fetchOrNull(getOrgEntitlements(org.id), "capacity/entitlements")
    : null;
  const features = entitlements?.data?.features ?? {};

  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
  const originParam = Array.isArray(params.origin) ? params.origin[0] : params.origin;
  const activeRole = typeof roleParam === "string" ? roleParam : undefined;
  const activeOrigin = typeof originParam === "string" ? originParam : undefined;

  const filters = encodedFilter
    ? decodeFilter(encodedFilter)
    : filterFromQueryParams(params);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="capacity" role={activeRole} />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <UpgradeGate
            feature="capacity_planning"
            requiredTier="team"
            features={features}
          >
            <header className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                  Capacity
                </p>
                <h1 className="mt-2 font-(--font-display) text-3xl">
                  Capacity Planning
                </h1>
                <p className="mt-2 text-sm text-(--ink-muted)">
                  Monte Carlo forecasting for work completion based on historical throughput.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.2em]">
                <Link
                  href={withFilterParam("/work?tab=capacity", filters, activeRole)}
                  className="rounded-full border border-(--card-stroke) px-4 py-2"
                >
                  View in Work context
                </Link>
                <Link
                  href={withFilterParam("/", filters, activeRole)}
                  className="rounded-full border border-(--card-stroke) px-4 py-2"
                >
                  Re-orient in cockpit
                </Link>
              </div>
            </header>

            <FilterBar view="work" />

            <div className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-3 text-[11px] leading-relaxed text-(--ink-muted)">
              <span className="text-foreground font-semibold uppercase tracking-wider">
                Perspective:
              </span>{" "}
              Forecasts use Monte Carlo simulation based on historical throughput data.
              Adjust the date range to control how much history informs the forecast.
            </div>

            <ContextStrip filters={filters} origin={activeOrigin} />

            <CapacityView filters={filters} />
          </UpgradeGate>
        </main>
      </div>
    </div>
  );
}
