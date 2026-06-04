import Link from "next/link";

import { BackendBanner } from "@/components/home/BackendBanner";
import { CockpitClient } from "@/components/home/CockpitClient";
import { InvestmentPreview } from "@/components/home/InvestmentPreview";
import { CockpitSummary } from "@/components/home/CockpitSummary";
import { RankedSignals } from "@/components/home/RankedSignals";
import { DataConfidenceIndicator } from "@/components/home/DataConfidenceIndicator";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { RoleSelectorWithSuspense, RoleFraming } from "@/components/RoleSelectorWrapper";
import { checkApiHealth, getApiMeta } from "@/lib/api/system";
import { getHomeData } from "@/lib/api/home";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { ClientTimestamp } from "@/components/ClientTimestamp";
import { CTA_LABELS } from "@/lib/design/cta";
import { isValidRole, DEFAULT_ROLE } from "@/lib/roleContext";
import type { HomeResponse } from "@/lib/types";

const loadHome = async (
  filters: Parameters<typeof getHomeData>[0],
): Promise<HomeResponse | null> => {
  try {
    return await getHomeData(filters);
  } catch {
    return null;
  }
};

type HomePageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Home({ searchParams }: HomePageProps) {
  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

  const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
  const activeRole = isValidRole(roleParam) ? roleParam : DEFAULT_ROLE;

  // Run health check in parallel with data fetches to eliminate the waterfall.
  const [health, home, meta] = await Promise.all([
    checkApiHealth(),
    loadHome(filters),
    getApiMeta(),
  ]);

  if (!health.ok) {
    return <ServiceUnavailable />;
  }
  const lastIngestedAt = home?.freshness.last_ingested_at ?? null;
  return (
    <div className="min-h-screen bg-(image:--hero-gradient) text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-20 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="home" role={activeRole} />
        <main className="flex min-w-0 flex-1 flex-col gap-10">
          <header className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.4)]">
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">Status</p>
                  <div className="mt-4">
                    <RoleSelectorWithSuspense />
                  </div>
                  <h1 className="mt-6 font-(--font-display) text-3xl leading-tight sm:text-4xl">
                    Developer Health Ops Cockpit
                  </h1>
                  <RoleFraming />
                  <p className="mt-3 max-w-xl text-sm text-(--ink-muted)">
                    System patterns over the last {filters.time.range_days} days.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <BackendBanner meta={meta} />
                <p className="text-sm text-(--ink-muted)">
                  <ClientTimestamp value={lastIngestedAt} prefix="Last updated: " />
                </p>
              </div>
            </div>
          </header>

          <GlobalContextBar filters={filters} />

          {/* Minimal freshness indicator only — no integration status UI */}

          {home?.data_confidence && <DataConfidenceIndicator confidence={home.data_confidence} />}

          <CockpitSummary home={home} filters={filters} />

          {home?.signals && home.signals.length > 0 ? (
            <RankedSignals signals={home.signals} filters={filters} />
          ) : null}

          <CockpitClient home={home} filters={filters} />

          <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <h3 className="font-(--font-display) text-xl">Investment mix</h3>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Work allocation snapshot for the selected window.
              </p>
              <div className="mt-4 flex flex-wrap gap-4 text-xs uppercase tracking-[0.2em]">
                <Link
                  href={withFilterParam("/investment", filters, activeRole)}
                  className="text-(--accent-2)"
                >
                  {CTA_LABELS.openWorkView}
                </Link>
              </div>
            </div>
            <InvestmentPreview filters={filters} />
          </section>
        </main>
      </div>
    </div>
  );
}
