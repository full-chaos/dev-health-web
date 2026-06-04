import { FilterBar } from "@/components/filters/FilterBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { AreaHub } from "@/components/navigation/AreaHub";
import { AreaSignalCard } from "@/components/navigation/AreaSignalCard";
import { BackLink } from "@/components/shared/BackLink";
import { ModeTabs, type ModeTabItem } from "@/components/shared/ModeTabs";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { FocusCard } from "./FocusCard";
import { checkApiHealth } from "@/lib/api/system";
import { getOpportunities } from "@/lib/api/home";
import { getAreaSignals } from "@/lib/areaSignals";
import { topSignals } from "@/lib/areaSignals/sort";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { withFilterParam } from "@/lib/filters/url";
import { getServerEnv } from "@/lib/config";

type OpportunitiesPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

// Improve landing sub-views (Framework A2). "Overview" is the area summary +
// signal grid; "Focus Cards" preserves the existing opportunity cards view.
// (CHAOS-2076: "RECOMMENDED NEXT STEP" text is a known backend bug — not fixed here.)
type ImproveView = "overview" | "focus-cards";
const IMPROVE_VIEWS: ImproveView[] = ["overview", "focus-cards"];

export default async function OpportunitiesPage({ searchParams }: OpportunitiesPageProps) {
  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
  const activeRole = typeof roleParam === "string" ? roleParam : undefined;
  const viewParam = Array.isArray(params.view) ? params.view[0] : params.view;
  const activeView: ImproveView = IMPROVE_VIEWS.includes(viewParam as ImproveView)
    ? (viewParam as ImproveView)
    : "overview";

  const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

  const env = getServerEnv();
  const isTestMode =
    env.DEV_HEALTH_TEST_MODE === "true" || env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

  // Resolve area signals, health, and opportunity data in parallel — no waterfall.
  const [health, data, improveSignals] = await Promise.all([
    checkApiHealth(),
    fetchOrNull(getOpportunities(filters), "opportunities/data"),
    getAreaSignals("improve", filters, isTestMode),
  ]);

  if (!health.ok && !isTestMode) {
    return <ServiceUnavailable />;
  }

  // Top sub-area signals bubbled up to the area overview (Framework A2a).
  const leadSignals = topSignals(improveSignals, 2);

  const tabs: ReadonlyArray<ModeTabItem<ImproveView>> = [
    {
      id: "overview",
      label: "Overview",
      href: withFilterParam("/opportunities", filters, activeRole),
    },
    {
      id: "focus-cards",
      label: "Focus Cards",
      href: withFilterParam("/opportunities?view=focus-cards", filters, activeRole),
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="opportunities" role={activeRole} />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-col gap-4">
            <BackLink href={withFilterParam("/", filters, activeRole)} />
            <div>
              {/* A6: the area is named by the AREA ("Improve"), not a borrowed leaf. */}
              <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">Improve</p>
              <h1 className="mt-2 font-(--font-display) text-3xl">Improve</h1>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Capacity planning, AI workflows, and evidence-linked improvement opportunities.
              </p>
            </div>

            {/* Overview: bubble the top sub-area signals up to the area level. */}
            {leadSignals.length > 0 ? (
              <div
                data-testid="improve-overview"
                className="grid gap-3 md:grid-cols-2"
              >
                {leadSignals.map((signal, index) => (
                  <AreaSignalCard
                    key={signal.id}
                    signal={signal}
                    filters={filters}
                    role={activeRole}
                    emphasized={index === 0}
                  />
                ))}
              </div>
            ) : null}
          </header>

          <ModeTabs items={tabs} activeId={activeView} ariaLabel="Improve views" />

          {activeView === "focus-cards" ? (
            <>
              <FilterBar view="opportunities" />
              <section className="grid gap-6 md:grid-cols-2">
                {(data?.items ?? []).map((card) => (
                  <FocusCard key={card.id} card={card} filters={filters} activeRole={activeRole} />
                ))}
                {!data?.items?.length && (
                  <div className="rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-70) p-6 text-sm text-(--ink-muted)">
                    Opportunity data unavailable.
                  </div>
                )}
              </section>
            </>
          ) : (
            <AreaHub
              areaId="improve"
              signals={improveSignals}
              filters={filters}
              role={activeRole}
              title="Improve signals"
              description="Capacity and AI workflow sub-areas."
            />
          )}
        </main>
      </div>
    </div>
  );
}
