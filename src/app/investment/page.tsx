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
import { ContextStrip } from "@/components/navigation/ContextStrip";

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
  const originParam = Array.isArray(params.origin) ? params.origin[0] : params.origin;
  const activeOrigin = typeof originParam === "string" ? originParam : undefined;

  const filters = encodedFilter
    ? decodeFilter(encodedFilter)
    : filterFromQueryParams(params);

  const data = await getInvestment(filters).catch(() => null);
  const nested = data ? mapInvestmentToNestedPie(data) : { categories: [], subtypes: [] };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="work" />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-(--ink-muted)">
                Investment
              </p>
              <h1 className="mt-2 font-(--font-display) text-3xl">
                Elapsed Work Allocation
              </h1>
              <div className="mt-4 p-3 rounded-2xl border border-(--card-stroke) bg-(--card-80) text-[11px] leading-relaxed text-(--ink-muted)">
                <span className="text-foreground font-semibold uppercase tracking-wider">Perspective:</span> Investment reflects effort and attention (not spend). Flow moves left-to-right (Allocation &rarr; Streams &rarr; Items).
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.2em]">
              <Link
                href={buildExploreUrl({ metric: "throughput", filters })}
                className="rounded-full border border-(--card-stroke) px-4 py-2"
              >
                Inspect causes
              </Link>
              <Link
                href={withFilterParam("/explore/landscape", filters)}
                className="rounded-full border border-(--card-stroke) px-4 py-2"
              >
                Re-orient in landscape
              </Link>
            </div>
          </header>

          <FilterBar view="investment" />

          <ContextStrip filters={filters} origin={activeOrigin} />

          {nested.categories.length ? (
            <InvestmentChart
              categories={nested.categories}
              subtypes={nested.subtypes}
              unit={data?.unit ?? "hours"}
            />
          ) : (
            <div className="rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-70) p-10 text-sm text-(--ink-muted)">
              Investment data unavailable.
            </div>
          )}

          <section className="grid gap-6 md:grid-cols-2">
            <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5">
              <h2 className="font-(--font-display) text-xl">Categories</h2>
              <div className="mt-4 space-y-3 text-sm">
                {nested.categories.map((category) => (
                  <Link
                    key={category.key}
                    href={withFilterParam(`/explore?metric=throughput&view=align&category=${category.key}`, filters)}
                    className="flex items-center justify-between rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-3"
                  >
                    <span>{category.name}</span>
                    <span className="text-xs text-(--ink-muted)">
                      {formatNumber(category.value)} units
                    </span>
                  </Link>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5">
              <h2 className="font-(--font-display) text-xl">Streams</h2>
              <div className="mt-4 space-y-3 text-sm">
                {nested.subtypes.map((subtype) => (
                  <Link
                    key={`${subtype.parentKey}-${subtype.name}`}
                    href={withFilterParam(`/explore?metric=throughput&view=align&stream=${subtype.name}`, filters)}
                    className="flex items-center justify-between rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-3"
                  >
                    <span>{subtype.name}</span>
                    <span className="text-xs text-(--ink-muted)">
                      {formatNumber(subtype.value)} units
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div >
  );
}
