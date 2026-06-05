import Link from "next/link";
import { BackLink } from "@/components/shared/BackLink";

import { UpgradeGate } from "@/components/billing/UpgradeGate";
import { FilterBar } from "@/components/filters/FilterBar";
import { InvestmentChart } from "@/components/investment/InvestmentChart";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { getInvestment } from "@/lib/api/investment";
import { getCurrentOrg, getOrgEntitlements } from "@/lib/admin/server";
import { CTA_LABELS } from "@/lib/design/cta";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { formatNumber } from "@/lib/formatters";
import {
    getSortedSubcategories,
    getSortedThemes,
    normalizeInvestmentMix,
} from "@/lib/investmentMix";
import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";

type InvestmentPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function InvestmentPage({ searchParams }: InvestmentPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const originParam = Array.isArray(params.origin) ? params.origin[0] : params.origin;
    const activeOrigin = typeof originParam === "string" ? originParam : undefined;

    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

    // Run health check, org entitlements, and investment data in parallel.
    const [health, orgResult, data] = await Promise.all([
        checkApiHealth(),
        getCurrentOrg().catch(() => ({ data: undefined })),
        fetchOrNull(getInvestment(filters), "investment/data"),
    ]);

    if (!health.ok) {
        return <ServiceUnavailable />;
    }

    const org = orgResult.data;
    const entitlements = org?.id
        ? await fetchOrNull(getOrgEntitlements(org.id), "investment/entitlements")
        : null;
    const features = entitlements?.data?.features ?? {};
    const mix = data ? normalizeInvestmentMix(data) : null;
    const themes = mix ? getSortedThemes(mix) : [];
    const subcategories = mix ? getSortedSubcategories(mix) : [];

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <PrimaryNav filters={filters} active="work" />
                <main className="flex min-w-0 flex-1 flex-col gap-8">
                    <UpgradeGate feature="investment_view" requiredTier="team" features={features}>
                        <header className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                                <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                                    Investment
                                </p>
                                <h1 className="mt-2 font-(--font-display) text-3xl">
                                    Elapsed Work Allocation
                                </h1>
                                <p className="mt-2 text-sm text-(--ink-muted)">
                                    Effort and attention allocation over the selected window.
                                </p>
                                <p className="mt-2 text-sm text-(--ink-muted)">
                                    Select a segment to investigate.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.2em]">
                                <Link
                                    href={buildExploreUrl({ metric: "throughput", filters })}
                                    className="rounded-full border border-(--card-stroke) px-4 py-2"
                                >
                                    {CTA_LABELS.inspectAssociations}
                                </Link>
                                <BackLink
                                    href={withFilterParam("/landscape", filters)}
                                    area="Landscape"
                                />
                            </div>
                        </header>

                        <FilterBar view="investment" />

                        <div className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-3 text-xs leading-relaxed text-(--ink-muted)">
                            <span className="text-foreground font-semibold uppercase tracking-wider">
                                Perspective:
                            </span>{" "}
                            Investment reflects effort and attention (not spend). Flow moves
                            left-to-right (Allocation &rarr; Streams &rarr; Items).
                        </div>

                        <GlobalContextBar filters={filters} origin={activeOrigin} />

                        {themes.length ? (
                            <InvestmentChart
                                themeDistribution={mix?.theme_distribution ?? {}}
                                subcategoryDistribution={mix?.subcategory_distribution ?? {}}
                                evidenceQualityDistribution={mix?.evidence_quality_distribution}
                                unit={mix?.unit ?? "hours"}
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
                                    {themes.map((category) => (
                                        <Link
                                            key={category.key}
                                            href={withFilterParam(
                                                `/explore?metric=throughput&view=align&category=${category.key}`,
                                                filters,
                                            )}
                                            className="flex items-center justify-between rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-3"
                                        >
                                            <span>
                                                {category.key
                                                    .replace(/[_-]+/g, " ")
                                                    .replace(/\\b\\w/g, (c) => c.toUpperCase())}
                                            </span>
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
                                    {subcategories.map((subtype) => (
                                        <Link
                                            key={subtype.key}
                                            href={withFilterParam(
                                                `/explore?metric=throughput&view=align&stream=${subtype.key}`,
                                                filters,
                                            )}
                                            className="flex items-center justify-between rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-3"
                                        >
                                            <span>
                                                {subtype.key
                                                    .split(".", 2)
                                                    .join(" · ")
                                                    .replace(/[_-]+/g, " ")
                                                    .replace(/\\b\\w/g, (c) => c.toUpperCase())}
                                            </span>
                                            <span className="text-xs text-(--ink-muted)">
                                                {formatNumber(subtype.value)} units
                                            </span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        </section>
                    </UpgradeGate>
                </main>
            </div>
        </div>
    );
}
