/**
 * /improve/experiments — Experiments sub-area (CHAOS-2219).
 *
 * v1: renders experiments derived at query-time from opportunity suggested_experiments, shown
 * as suggestions: the hypothesis, the source metric, and the evidence behind it. Owner and stop
 * condition are empty for derived experiments and are not shown until experiments can be saved
 * (ruling 10). Empty state uses DataState with the canonical "detector-enabled-no-findings"
 * variant rather than fabricated content; a failed load is an error, not an empty state.
 */

import { PageFactsEvidenceAction } from "@/components/evidence/PageFactsEvidenceAction";
import { DataState } from "@/components/ui/DataState";
import { Notice } from "@/components/ui/Notice";
import { RetryButton } from "@/components/ui/RetryButton";
import { ExperimentCards } from "./ExperimentCards";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { requireSession } from "@/lib/auth";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { getExperimentsViaGraphQL } from "@/lib/graphql/improveFetchers";
import { getServerEnv } from "@/lib/config";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";

type ExperimentsPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

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
                actions={
                    hasData ? (
                        <PageFactsEvidenceAction
                            title="Experiments"
                            facts={[
                                {
                                    label: "Suggested experiments",
                                    value: String(experiments.length),
                                },
                                ...experiments.map((experiment, index) => ({
                                    label: `Suggestion ${index + 1}`,
                                    value: experiment.metric
                                        ? `${experiment.hypothesis} (${experiment.metric})`
                                        : experiment.hypothesis,
                                })),
                            ]}
                        />
                    ) : undefined
                }
                subtitle="Process experiments derived from improvement opportunities — each with a hypothesis and a metric."
            />

            <ScopeBar pageFilters={false} />

            {!hasData && (
                <DataState
                    variant="error"
                    title="Experiments unavailable"
                    message="Could not load experiment suggestions for the current window. Connect a data source or retry."
                    action={<RetryButton />}
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
                <>
                    <Notice variant="info" live={false} data-testid="experiments-notice">
                        {experiments.length} suggested{" "}
                        {experiments.length === 1 ? "experiment" : "experiments"}. Suggestions are
                        not active or assigned experiments.
                    </Notice>
                    <ExperimentCards experiments={experiments} filters={filters} />
                </>
            )}
        </div>
    );
}
