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
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { requireSession } from "@/lib/auth";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { getExperimentsViaGraphQL } from "@/lib/graphql/improveFetchers";
import type { Experiment } from "@/lib/graphql/types";
import { getServerEnv } from "@/lib/config";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";

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
                <span className="shrink-0 rounded-full bg-(--card-80) px-2 py-0.5 text-label-caps uppercase tracking-[0.15em] text-(--ink-muted)">
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
    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

    const env = getServerEnv();
    const isTestMode =
        env.DEV_HEALTH_TEST_MODE === "true" || env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

    const orgId = session.user?.org_id ?? "demo-org";

    const [health, experimentsResult] = await Promise.all([
        checkApiHealth(),
        getExperimentsViaGraphQL(orgId, filters),
    ]);

    if (!health.ok && !isTestMode) {
        return <ServiceUnavailable landmark={false} />;
    }

    const experiments = experimentsResult?.items ?? [];
    const hasData = experimentsResult !== null;

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader
                title="Experiments"
                subtitle="Process experiments derived from improvement opportunities — each with a hypothesis, owner, metric, and stop condition."
            />

            <ScopeBar pageFilters={false} />

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
        </div>
    );
}
