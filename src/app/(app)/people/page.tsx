import { FilterBar } from "@/components/filters/FilterBar";
import { PeopleSearch } from "@/components/people/PeopleSearch";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { checkApiHealth } from "@/lib/api";
import { decodeFilter } from "@/lib/filters/encode";
import { defaultMetricFilter } from "@/lib/filters/defaults";

type PeoplePageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function PeoplePage({ searchParams }: PeoplePageProps) {
  const health = await checkApiHealth();

  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const filters = encodedFilter
    ? decodeFilter(encodedFilter)
    : defaultMetricFilter;
  const query = Array.isArray(params.q) ? params.q[0] : params.q;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="people" />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-(--ink-muted)">
                People
              </p>
              <h1 className="mt-2 font-(--font-display) text-3xl">
                Individual metrics
              </h1>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Individual metrics for a single-person view.
              </p>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Select an individual to investigate.
              </p>
            </div>
          </header>

          {!health.ok && (
            <div className="rounded-3xl border border-dashed border-amber-400/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
              Data service unavailable. Search results may be delayed until the API is back.
            </div>
          )}
          <FilterBar view="people" />
          <PeopleSearch query={query} filters={filters} />
        </main>
      </div>
    </div>
  );
}
