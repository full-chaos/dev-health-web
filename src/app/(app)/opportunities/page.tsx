import Link from "next/link";

import { FilterBar } from "@/components/filters/FilterBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { AreaHub } from "@/components/navigation/AreaHub";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { FocusCard } from "./FocusCard";
import { checkApiHealth } from "@/lib/api/system";
import { getOpportunities } from "@/lib/api/home";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { withFilterParam } from "@/lib/filters/url";

type OpportunitiesPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function OpportunitiesPage({ searchParams }: OpportunitiesPageProps) {
  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
  const activeRole = typeof roleParam === "string" ? roleParam : undefined;

  const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

  // Run health check and data fetch in parallel to eliminate the waterfall.
  const [health, data] = await Promise.all([
    checkApiHealth(),
    fetchOrNull(getOpportunities(filters), "opportunities/data"),
  ]);

  if (!health.ok) {
    return <ServiceUnavailable />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="opportunities" role={activeRole} />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                Opportunities
              </p>
              <h1 className="mt-2 font-(--font-display) text-3xl">Focus Cards</h1>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Evidence-linked threads with candidate experiments.
              </p>
              <p className="mt-2 text-sm text-(--ink-muted)">Open a card to review evidence.</p>
            </div>
            <Link
              href={withFilterParam("/", filters, activeRole)}
              className="rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em]"
            >
              Back to cockpit
            </Link>
          </header>

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
          <AreaHub
            areaId="improve"
            filters={filters}
            role={activeRole}
            title="Improve area"
            description="Other improvement surfaces."
          />
        </main>
      </div>
    </div>
  );
}
