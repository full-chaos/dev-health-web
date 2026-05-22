import Link from "next/link";

import { FeatureFlagTable } from "@/components/feature-flags/FeatureFlagTable";
import { MetricCard } from "@/components/metrics/MetricCard";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { fetchFeatureFlagsData, fetchFeatureFlagList } from "@/lib/feature-flags/fetchers";
import { FF_MEASURES } from "@/lib/feature-flags/constants";
import { getServerEnv } from "@/lib/config";
import { fetchFlagPage } from "./actions";

type FeatureFlagsPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

const SEVERITY_COLORS: Record<string, string> = {
  low: "border-l-emerald-500",
  moderate: "border-l-amber-500",
  high: "border-l-orange-500",
  critical: "border-l-red-500",
};

export default async function FeatureFlagsPage({ searchParams }: FeatureFlagsPageProps) {
  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
  const activeRole = typeof roleParam === "string" ? roleParam : undefined;

  const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

  const env = getServerEnv();
  const isTestMode =
    env.DEV_HEALTH_TEST_MODE === "true" || env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

  const rangeDays = filters?.time?.range_days ?? 14;
  const today = new Date();
  const endDate = filters?.time?.end_date ?? today.toISOString().slice(0, 10);
  const startDate =
    filters?.time?.start_date ??
    new Date(today.getTime() - rangeDays * 86_400_000).toISOString().slice(0, 10);

  const [health, ffData, flagList] = await Promise.all([
    checkApiHealth(),
    fetchFeatureFlagsData({ startDate, endDate }, isTestMode),
    fetchFeatureFlagList(0, 20),
  ]);

  if (!health.ok && !isTestMode) {
    return <ServiceUnavailable />;
  }

  const { summary } = ffData;
  const severityBorder = SEVERITY_COLORS[summary.releaseFrictionSeverity] ?? "";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="feature-flags" role={activeRole} />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                Feature Flags
              </p>
              <h1 className="mt-2 font-(--font-display) text-3xl">Overview</h1>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Flag activity, release friction, and telemetry coverage.
              </p>
            </div>
            <Link
              href={withFilterParam("/", filters, activeRole)}
              className="rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em]"
            >
              Back to cockpit
            </Link>
          </header>

          <section className="grid gap-4 lg:grid-cols-2">
            <MetricCard
              label={FF_MEASURES.ACTIVE_FLAGS.label}
              href="/feature-flags"
              value={summary.activeFlags}
              unit=""
              delta={summary.activeFlagsDelta}
              spark={summary.activeFlagsSpark}
              caption={FF_MEASURES.ACTIVE_FLAGS.description}
            />

            <MetricCard
              label={FF_MEASURES.RELEASE_FRICTION_DELTA.label}
              href="/feature-flags"
              value={summary.releaseFrictionDelta}
              unit="%"
              spark={summary.releaseFrictionSpark}
              caption={`Severity: ${summary.releaseFrictionSeverity}`}
              className={severityBorder ? `border-l-4 ${severityBorder}` : undefined}
            />

            <MetricCard
              label={FF_MEASURES.RELEASE_ERROR_RATE_DELTA.label}
              href="/feature-flags"
              value={summary.releaseErrorRateDelta}
              unit="%"
              spark={summary.releaseErrorRateSpark}
              caption={FF_MEASURES.RELEASE_ERROR_RATE_DELTA.description}
            />

            <MetricCard
              label={FF_MEASURES.COVERAGE_RATIO.label}
              href="/feature-flags"
              value={summary.coverageRatio}
              unit="%"
              delta={summary.coverageRatioDelta}
              spark={summary.coverageRatioSpark}
              caption={FF_MEASURES.COVERAGE_RATIO.description}
            />
          </section>

          <section>
            <h2 className="mb-4 text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
              Flag Registry
            </h2>
            <FeatureFlagTable initialData={flagList} fetchAction={fetchFlagPage} />
          </section>
        </main>
      </div>
    </div>
  );
}
