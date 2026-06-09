import { FilterBar } from "@/components/filters/FilterBar";
import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { BackLink } from "@/components/shared/BackLink";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { OpportunityCard } from "./OpportunityCard";
import { checkApiHealth } from "@/lib/api/system";
import { getOpportunities } from "@/lib/api/home";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { withFilterParam } from "@/lib/filters/url";
import { getServerEnv } from "@/lib/config";

type OpportunitiesPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function OpportunitiesPage({ searchParams }: OpportunitiesPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;

    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

    const env = getServerEnv();
    const isTestMode =
        env.DEV_HEALTH_TEST_MODE === "true" || env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

    const [health, data] = await Promise.all([
        checkApiHealth(),
        fetchOrNull(getOpportunities(filters), "opportunities/data"),
    ]);

    if (!health.ok && !isTestMode) {
        return <ServiceUnavailable />;
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <PrimaryNav filters={filters} active="opportunities" role={activeRole} />
                <main className="flex min-w-0 flex-1 flex-col gap-8">
                    <header className="flex flex-col gap-4">
                        <BackLink href={withFilterParam("/improve", filters, activeRole)} />
                        <div>
                            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                                Improve
                            </p>
                            <h1 className="mt-2 font-(--font-display) text-3xl">Opportunities</h1>
                            <p className="mt-2 text-sm text-(--ink-muted)">
                                Evidence-linked improvement opportunities with clear artifacts and
                                recommended next steps.
                            </p>
                        </div>
                    </header>

                    <GlobalContextBar filters={filters} />
                    <FilterBar view="opportunities" />

                    <section className="grid gap-6 md:grid-cols-2" aria-label="Opportunities">
                        {(data?.items ?? []).map((card) => (
                            <OpportunityCard
                                key={card.id}
                                card={card}
                                filters={filters}
                                activeRole={activeRole}
                            />
                        ))}
                        {data && data.items.length === 0 && (
                            <div className="rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-70) p-6 text-sm text-(--ink-muted)">
                                No open opportunities in this window — nothing is trending worse for
                                the current scope.
                            </div>
                        )}
                        {!data && (
                            <div className="rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-70) p-6 text-sm text-(--ink-muted)">
                                Opportunity data unavailable.
                            </div>
                        )}
                    </section>
                </main>
            </div>
        </div>
    );
}
