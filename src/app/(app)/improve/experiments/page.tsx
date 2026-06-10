/**
 * /improve/experiments — Experiments sub-area (CHAOS-2219).
 *
 * v1: renders experiments derived at query-time from opportunity
 * suggested_experiments.  Each card shows the hypothesis, source metric,
 * and status badge.  Empty state uses DataState with the canonical
 * "detector-enabled-no-findings" variant rather than fabricated content.
 *
 * Penpot contract: Hypothesis · Owner · Metric · Stop condition.
 * v1 fields Owner and Stop condition are empty for derived experiments and
 * rendered as "—" placeholders so the layout is stable for v2 promotion.
 */

import { DataState } from "@/components/ui/DataState";
import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { BackLink } from "@/components/shared/BackLink";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { requireSession } from "@/lib/auth";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { getExperimentsViaGraphQL } from "@/lib/graphql/improveFetchers";
import type { Experiment } from "@/lib/graphql/types";
import { getServerEnv } from "@/lib/config";

type ExperimentsPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

function ExperimentCard({ experiment }: { experiment: Experiment }) {
    return (
        <article
            className="flex flex-col gap-3 rounded-3xl border border-(--card-stroke) bg-card p-6"
            data-testid="experiment-card"
        >
            <header className="flex items-start justify-between gap-4">
                <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                    {experiment.metric || "Experiment"}
                </p>
                <span className="shrink-0 rounded-full bg-(--card-80) px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-(--ink-muted)">
                    {experiment.status}
                </span>
            </header>
            <p className="font-(--font-display) text-base leading-snug">{experiment.hypothesis}</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-(--ink-muted)">
                <dt className="font-medium uppercase tracking-[0.12em]">Owner</dt>
                <dd>{experiment.owner || "—"}</dd>
                <dt className="font-medium uppercase tracking-[0.12em]">Stop condition</dt>
                <dd className="col-span-1">{experiment.stopCondition || "—"}</dd>
            </dl>
        </article>
    );
}

export default async function ExperimentsPage({ searchParams }: ExperimentsPageProps) {
    const session = await requireSession();
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;
    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

    const env = getServerEnv();
    const isTestMode =
        env.DEV_HEALTH_TEST_MODE === "true" || env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

    const orgId = session.user?.org_id ?? "demo-org";

    const [health, experimentsResult] = await Promise.all([
        checkApiHealth(),
        getExperimentsViaGraphQL(orgId),
    ]);

    if (!health.ok && !isTestMode) {
        return <ServiceUnavailable />;
    }

    const experiments = experimentsResult?.items ?? [];
    const hasData = experimentsResult !== null;

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <PrimaryNav filters={filters} active="experiments" role={activeRole} />
                <main className="flex min-w-0 flex-1 flex-col gap-8">
                    <header className="flex flex-col gap-4">
                        <BackLink href={withFilterParam("/improve", filters, activeRole)} />
                        <div>
                            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                                Improve
                            </p>
                            <h1 className="mt-2 font-(--font-display) text-3xl">Experiments</h1>
                            <p className="mt-2 text-sm text-(--ink-muted)">
                                Process experiments derived from improvement opportunities — each
                                with a hypothesis, owner, metric, and stop condition.
                            </p>
                        </div>
                    </header>

                    <GlobalContextBar filters={filters} />

                    {!hasData && (
                        <DataState
                            variant="detector-unavailable"
                            title="Experiments unavailable"
                            description="Could not load experiment suggestions for the current window. Connect a data source or retry."
                            className="py-12"
                            data-testid="experiments-unavailable"
                        />
                    )}

                    {hasData && experiments.length === 0 && (
                        <DataState
                            variant="detector-enabled-no-findings"
                            title="No experiments in this window"
                            description="There are no open improvement opportunities to derive experiments from right now. Experiments appear here once the opportunities detector surfaces candidates."
                            className="py-12"
                            data-testid="experiments-empty"
                        />
                    )}

                    {hasData && experiments.length > 0 && (
                        <section
                            className="grid gap-6 md:grid-cols-2"
                            aria-label="Experiments"
                            data-testid="experiments-list"
                        >
                            {experiments.map((experiment) => (
                                <ExperimentCard key={experiment.id} experiment={experiment} />
                            ))}
                        </section>
                    )}
                </main>
            </div>
        </div>
    );
}
