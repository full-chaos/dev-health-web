import Link from "next/link";

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
import { CTA_LABELS } from "@/lib/design/cta";
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
                            <div className="rounded-3xl border border-dashed border-(--border) bg-(--card-70) p-6 text-sm text-(--ink-muted)">
                                No open opportunities in this window — nothing is trending worse for
                                the current scope.
                            </div>
                        )}
                        {!data && (
                            <div className="rounded-3xl border border-dashed border-(--border) bg-(--card-70) p-6 text-sm text-(--ink-muted)">
                                Opportunity data unavailable.
                            </div>
                        )}
                    </section>

                    <section
                        className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-(--border) bg-card p-5"
                        aria-label="AI automation opportunities"
                        data-testid="improve-ai-automations-crosslink"
                    >
                        <div>
                            <h2 className="font-(--font-display) text-lg">
                                Automation opportunities for AI-assisted work
                            </h2>
                            <p className="mt-1 max-w-2xl text-sm text-(--ink-muted)">
                                Responsible automation candidates detected on AI-attributed work
                                live in the AI area, scoped to your current filters.
                            </p>
                        </div>
                        <Link
                            href={withFilterParam("/ai/automations", filters, activeRole)}
                            className="text-xs uppercase tracking-[0.2em] text-(--accent-2) underline-offset-4 hover:underline"
                        >
                            {CTA_LABELS.seeAIAutomations} →
                        </Link>
                    </section>
                </main>
            </div>
        </div>
    );
}
