import Link from "next/link";

import { FilterBar } from "@/components/filters/FilterBar";
import { InvestmentChart } from "@/components/investment/InvestmentChart";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth, getInvestment } from "@/lib/api";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { formatNumber } from "@/lib/formatters";
import { mapInvestmentToNestedPie } from "@/lib/mappers";

type InvestmentPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function InvestmentPage({ searchParams }: InvestmentPageProps) {
  const health = await checkApiHealth();
  if (!health.ok) {
    return <ServiceUnavailable />;
  }

  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const filters = encodedFilter
    ? decodeFilter(encodedFilter)
    : filterFromQueryParams(params);

  const data = await getInvestment(filters).catch(() => null);
  const nested = data ? mapInvestmentToNestedPie(data) : { categories: [], subtypes: [] };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="work" />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                Investment
              </p>
              <h1 className="mt-2 font-[var(--font-display)] text-3xl">
                Work Allocation
              </h1>
              <p className="mt-2 text-sm text-[var(--ink-muted)]">
                Investment reflects effort and attention, not financial spend.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.2em]">
              <Link
                href={buildExploreUrl({ metric: "throughput", filters })}
                className="rounded-full border border-[var(--card-stroke)] px-4 py-2"
              >
                Open in Explore
              </Link>
              <Link
                href={withFilterParam("/work", filters)}
                className="rounded-full border border-[var(--card-stroke)] px-4 py-2"
              >
                Back to Work
              </Link>
            </div>
          </header>

          <FilterBar view="investment" />

          {nested.categories.length ? (
            <InvestmentChart categories={nested.categories} subtypes={nested.subtypes} />
          ) : (
            <div className="rounded-3xl border border-dashed border-[var(--card-stroke)] bg-[var(--card-70)] p-10 text-sm text-[var(--ink-muted)]">
              Investment data unavailable.
            </div>
          )}

          <section className="grid gap-6 md:grid-cols-2">
            <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-5">
              <h2 className="font-[var(--font-display)] text-xl">Categories</h2>
              <div className="mt-4 space-y-3 text-sm">
                {nested.categories.map((category) => (
                  <Link
                    key={category.key}
                    href={withFilterParam(`/explore?metric=throughput&view=align&category=${category.key}`, filters)}
                    className="flex items-center justify-between rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-70)] px-4 py-3"
                  >
                    <span>{category.name}</span>
                    <span className="text-xs text-[var(--ink-muted)]">
                      {formatNumber(category.value)} units
                    </span>
                  </Link>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-5">
              <h2 className="font-[var(--font-display)] text-xl">Streams</h2>
              <div className="mt-4 space-y-3 text-sm">
                {nested.subtypes.map((subtype) => (
                  <Link
                    key={`${subtype.parentKey}-${subtype.name}`}
                    href={withFilterParam(`/explore?metric=throughput&view=align&stream=${subtype.name}`, filters)}
                    className="flex items-center justify-between rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-70)] px-4 py-3"
                  >
                    <span>{subtype.name}</span>
                    <span className="text-xs text-[var(--ink-muted)]">
                      {formatNumber(subtype.value)} units
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
