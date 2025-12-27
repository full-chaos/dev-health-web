import Link from "next/link";

import { InvestmentChart } from "@/components/investment/InvestmentChart";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth, getInvestment } from "@/lib/api";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
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
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pb-16 pt-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
              Investment
            </p>
            <h1 className="mt-2 font-[var(--font-display)] text-3xl">
              Work Allocation
            </h1>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">
              Category and stream breakdown for the current window.
            </p>
          </div>
          <Link
            href={withFilterParam("/", filters)}
            className="rounded-full border border-[var(--card-stroke)] px-4 py-2 text-xs uppercase tracking-[0.2em]"
          >
            Back to Home
          </Link>
        </header>

        {nested.categories.length ? (
          <InvestmentChart categories={nested.categories} subtypes={nested.subtypes} />
        ) : (
          <div className="rounded-3xl border border-dashed border-[var(--card-stroke)] bg-white/70 p-10 text-sm text-[var(--ink-muted)]">
            Investment data unavailable.
          </div>
        )}

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-[var(--card-stroke)] bg-white/80 p-5">
            <h2 className="font-[var(--font-display)] text-xl">Categories</h2>
            <div className="mt-4 space-y-3 text-sm">
              {nested.categories.map((category) => (
                <Link
                  key={category.key}
                  href={withFilterParam(`/explore?metric=throughput&view=align&category=${category.key}`, filters)}
                  className="flex items-center justify-between rounded-2xl border border-[var(--card-stroke)] bg-white/70 px-4 py-3"
                >
                  <span>{category.name}</span>
                  <span className="text-xs text-[var(--ink-muted)]">
                    {formatNumber(category.value)} units
                  </span>
                </Link>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-[var(--card-stroke)] bg-white/80 p-5">
            <h2 className="font-[var(--font-display)] text-xl">Streams</h2>
            <div className="mt-4 space-y-3 text-sm">
              {nested.subtypes.map((subtype) => (
                <Link
                  key={`${subtype.parentKey}-${subtype.name}`}
                  href={withFilterParam(`/explore?metric=throughput&view=align&stream=${subtype.name}`, filters)}
                  className="flex items-center justify-between rounded-2xl border border-[var(--card-stroke)] bg-white/70 px-4 py-3"
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
  );
}
