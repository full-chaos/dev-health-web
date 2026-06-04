import { FilterBar } from "@/components/filters/FilterBar";
import { AreaOverview } from "@/components/navigation/AreaOverview";
import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { BackLink } from "@/components/shared/BackLink";
import { checkApiHealth } from "@/lib/api/system";
import { getAreaSignals } from "@/lib/areaSignals";
import { getServerEnv } from "@/lib/config";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";

type PlanPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function PlanPage({ searchParams }: PlanPageProps) {
  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
  const originParam = Array.isArray(params.origin) ? params.origin[0] : params.origin;
  const activeRole = typeof roleParam === "string" ? roleParam : undefined;
  const activeOrigin = typeof originParam === "string" ? originParam : undefined;
  const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

  const env = getServerEnv();
  const isTestMode =
    env.DEV_HEALTH_TEST_MODE === "true" || env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

  const [health, planSignals] = await Promise.all([
    checkApiHealth(),
    getAreaSignals("plan", filters, isTestMode),
  ]);

  if (!health.ok && !isTestMode) {
    return <ServiceUnavailable />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="plan" role={activeRole} />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-col gap-4">
            <BackLink href={withFilterParam("/", filters, activeRole)} />
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">Plan</p>
              <h1 className="mt-2 font-(--font-display) text-3xl">Plan</h1>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Forecast delivery, review operating commitments, and keep planning workflows in one
                durable home.
              </p>
            </div>
          </header>

          <GlobalContextBar filters={filters} origin={activeOrigin} />
          <FilterBar view="capacity-planning" />

          <AreaOverview
            areaId="plan"
            signals={planSignals}
            filters={filters}
            role={activeRole}
            title="Related workflows"
            description="Planning workflows, ordered by current signal availability."
          />
        </main>
      </div>
    </div>
  );
}
