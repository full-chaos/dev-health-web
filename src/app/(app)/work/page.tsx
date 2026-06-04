import { redirect } from "next/navigation";

import { FilterBar } from "@/components/filters/FilterBar";
import { AreaOverview } from "@/components/navigation/AreaOverview";
import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { BackLink } from "@/components/shared/BackLink";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { getDiagnoseSignals } from "@/lib/areaSignals/diagnose";
import { getServerEnv } from "@/lib/config";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";

type WorkPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

const legacyWorkDestinations: Record<string, string> = {
  landscape: "/landscape",
  heatmap: "/landscape",
  flow: "/metrics?tab=flow",
  investment: "/investment",
  capacity: "/capacity",
  flame: "/work",
  evidence: "/work",
  graph: "/work",
};

export default async function WorkPage({ searchParams }: WorkPageProps) {
  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
  const originParam = Array.isArray(params.origin) ? params.origin[0] : params.origin;
  const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const viewParam = Array.isArray(params.view) ? params.view[0] : params.view;
  const activeRole = typeof roleParam === "string" ? roleParam : undefined;
  const activeOrigin = typeof originParam === "string" ? originParam : undefined;

  const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

  const legacyDestination =
    typeof tabParam === "string" ? legacyWorkDestinations[tabParam] : undefined;
  if (legacyDestination) {
    redirect(withFilterParam(legacyDestination, filters, activeRole));
  }
  if (viewParam === "work") {
    redirect(withFilterParam("/landscape", filters, activeRole));
  }

  const env = getServerEnv();
  const isTestMode =
    env.DEV_HEALTH_TEST_MODE === "true" || env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

  const [health, diagnoseSignals] = await Promise.all([
    checkApiHealth(),
    getDiagnoseSignals(filters, isTestMode),
  ]);

  if (!health.ok && !isTestMode) {
    return <ServiceUnavailable />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="diagnose" role={activeRole} />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-col gap-4">
            <BackLink href={withFilterParam("/", filters, activeRole)} />
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">Diagnose</p>
              <h1 className="mt-2 font-(--font-display) text-3xl">Diagnose</h1>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Investigate flow, investment, landscape, people, code, complexity, cognitive load,
                and bottlenecks from one durable area.
              </p>
            </div>
          </header>

          <GlobalContextBar filters={filters} origin={activeOrigin} />
          <FilterBar view="work" />

          <AreaOverview
            areaId="diagnose"
            signals={diagnoseSignals}
            filters={filters}
            role={activeRole}
            title="Related workflows"
            description="Diagnostic sub-areas, ordered by severity."
          />
        </main>
      </div>
    </div>
  );
}
