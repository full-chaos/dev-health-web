import { FlameDiagram } from "@/components/charts/FlameDiagram";
import { AskDevTrigger } from "@/components/ask-dev/AskDevTrigger";
import { BackLink } from "@/components/shared/BackLink";
import { CommitHashDisclosure } from "@/components/shared/CommitHashDisclosure";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { getFlame } from "@/lib/api/visuals";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { ClientTimestamp } from "@/components/ClientTimestamp";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { RelatedEntitiesPanel } from "@/components/work/RelatedEntitiesPanel";
import { requireSession } from "@/lib/auth";
import { formatNumber } from "@/lib/formatters";
import { getServerEnv } from "@/lib/config";
import {
    getAIWorkflowDrilldownViaGraphQL,
    getPrDetailViaGraphQL,
    getWorkUnitInvestmentDistribution,
} from "@/lib/graphql/workGraphFetchers";
import type {
    AIWorkflowDrilldownResult,
    PullRequestDetail,
    WorkUnitInvestmentDistribution,
} from "@/lib/graphql/types";

type PrDetailPageProps = {
    params: Promise<{ pr_id: string }>;
};

function isExplicitDemoMode(): boolean {
    const env = getServerEnv();
    return (
        env.DEV_HEALTH_TEST_MODE === "true" ||
        env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true" ||
        env.NEXT_PUBLIC_DEMO_MODE === "true"
    );
}

function emptyInvestment(rootId: string): WorkUnitInvestmentDistribution {
    return {
        workUnitId: rootId,
        themeDistribution: {},
        subcategoryDistribution: {},
        evidenceQuotes: [],
        uncertainty: "No persisted investment distribution returned for this PR.",
    };
}

function emptyDrilldown(orgId: string, rootId: string): AIWorkflowDrilldownResult {
    return {
        orgId,
        rootType: "PR",
        rootId,
        nodes: [],
        edges: [],
        partial: false,
        dataAvailable: false,
    };
}

function metricValue(value: number | null | undefined): string {
    return typeof value === "number" ? formatNumber(value) : "No data";
}

function PrDetailSummary({ pr }: { pr: PullRequestDetail }) {
    return (
        <section className="rounded-3xl border border-(--card-stroke) bg-(--card) p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                        {pr.repoName ?? pr.repoId} · #{pr.number}
                    </p>
                    <h2 className="mt-2 font-(--font-display) text-2xl">
                        {pr.title ?? "Untitled pull request"}
                    </h2>
                    <p className="mt-2 text-sm text-(--ink-muted)">
                        {pr.authorName ?? pr.authorEmail ?? "Unknown author"} opened{" "}
                        <ClientTimestamp value={pr.createdAt} />
                    </p>
                </div>
                <span className="rounded-full border border-(--card-stroke) px-3 py-1 text-xs uppercase tracking-[0.18em] text-(--ink-muted)">
                    {pr.state ?? "No state"}
                </span>
            </div>
            <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
                    <dt className="text-xs uppercase tracking-[0.16em] text-(--ink-muted)">
                        Changed files
                    </dt>
                    <dd className="mt-2 font-medium">{metricValue(pr.changedFiles)}</dd>
                </div>
                <div className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
                    <dt className="text-xs uppercase tracking-[0.16em] text-(--ink-muted)">
                        Additions
                    </dt>
                    <dd className="mt-2 font-medium">{metricValue(pr.additions)}</dd>
                </div>
                <div className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
                    <dt className="text-xs uppercase tracking-[0.16em] text-(--ink-muted)">
                        Deletions
                    </dt>
                    <dd className="mt-2 font-medium">{metricValue(pr.deletions)}</dd>
                </div>
                <div className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
                    <dt className="text-xs uppercase tracking-[0.16em] text-(--ink-muted)">
                        Reviews
                    </dt>
                    <dd className="mt-2 font-medium">{formatNumber(pr.reviewsCount)}</dd>
                </div>
            </dl>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-(--ink-muted)">
                        Reviews
                    </h3>
                    {pr.reviews.length === 0 ? (
                        <p className="mt-3 text-sm text-(--ink-muted)">
                            No persisted reviews for this PR.
                        </p>
                    ) : (
                        <ul className="mt-3 space-y-2 text-sm text-(--ink-muted)">
                            {pr.reviews.map((review) => (
                                <li key={review.reviewId}>
                                    <span className="text-foreground">{review.reviewer}</span> ·{" "}
                                    {review.state} · <ClientTimestamp value={review.submittedAt} />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-(--ink-muted)">
                        Commits
                    </h3>
                    {pr.commits.length === 0 ? (
                        <p className="mt-3 text-sm text-(--ink-muted)">
                            No persisted commit links for this PR.
                        </p>
                    ) : (
                        <ul className="mt-3 space-y-2 text-sm text-(--ink-muted)">
                            {pr.commits.map((commit) => (
                                <li key={commit.hash} className="min-w-0 break-words">
                                    <CommitHashDisclosure hash={commit.hash} /> ·{" "}
                                    {commit.message ?? "No message"}
                                    {commit.provenance ? ` · ${commit.provenance}` : ""}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </section>
    );
}

export default async function PrDetailPage({ params }: PrDetailPageProps) {
    const health = await checkApiHealth();
    if (!health.ok) {
        return <ServiceUnavailable />;
    }

    const { pr_id: encodedPrId } = await params;
    const prId = decodeURIComponent(encodedPrId);
    const session = await requireSession();
    const orgId = session.user.org_id ?? "default-org";
    const demoMode = isExplicitDemoMode();
    const prResult = await getPrDetailViaGraphQL({ orgId, id: prId })
        .then((pr) => ({ pr, error: null }))
        .catch((error: unknown) => ({ pr: null, error }));
    if (prResult.error) {
        return (
            <div className="min-h-screen bg-background text-foreground">
                <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                    <PrimaryNav filters={defaultMetricFilter} />
                    <main className="flex min-w-0 flex-1 flex-col gap-8">
                        <PrHeader />
                        <div className="rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-70) p-6 text-sm text-(--ink-muted)">
                            PR detail could not be loaded from the backend. Try again after the data
                            service is healthy.
                        </div>
                    </main>
                </div>
            </div>
        );
    }
    const shouldLoadRelatedEntities = prResult.pr !== null || demoMode;
    const [flame, relatedEntitiesResult] = await Promise.all([
        fetchOrNull(getFlame({ entity_type: "pr", entity_id: prId }), "pr-flame"),
        shouldLoadRelatedEntities
            ? getAIWorkflowDrilldownViaGraphQL({
                  orgId,
                  rootType: "PR",
                  rootId: prId,
                  useDemoFallback: demoMode,
              })
                  .then((drilldown) => ({ drilldown, relatedEntitiesError: false }))
                  .catch(() => ({
                      drilldown: emptyDrilldown(orgId, prId),
                      relatedEntitiesError: true,
                  }))
            : Promise.resolve({
                  drilldown: emptyDrilldown(orgId, prId),
                  relatedEntitiesError: false,
              }),
    ]);
    const { drilldown, relatedEntitiesError } = relatedEntitiesResult;
    const investment = demoMode
        ? getWorkUnitInvestmentDistribution({ rootType: "PR", rootId: prId })
        : emptyInvestment(prId);

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <PrimaryNav filters={defaultMetricFilter} />
                <main className="flex min-w-0 flex-1 flex-col gap-8">
                    <PrHeader
                        context={
                            prResult.pr
                                ? {
                                      entityId: prId,
                                      label: `${prResult.pr.repoName ?? prResult.pr.repoId} #${prResult.pr.number}`,
                                      repositoryId: prResult.pr.repoId,
                                  }
                                : undefined
                        }
                    />

                    {prResult.pr ? (
                        <PrDetailSummary pr={prResult.pr} />
                    ) : (
                        <div className="rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-70) p-6 text-sm text-(--ink-muted)">
                            No PR detail found for this id. Check that the URL uses a persisted PR
                            id such as repo_id#prnumber.
                        </div>
                    )}

                    {!flame?.entity || !flame.timeline || !flame.frames ? (
                        <div className="rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-70) p-6 text-sm text-(--ink-muted)">
                            Flame data unavailable for this PR.
                        </div>
                    ) : (
                        <section className="rounded-3xl border border-(--card-stroke) bg-(--card) p-6">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h2 className="font-(--font-display) text-xl">
                                        {String(flame.entity.title ?? "PR")}
                                    </h2>
                                    <p className="mt-2 text-xs text-(--ink-muted)">
                                        <ClientTimestamp
                                            value={flame.timeline.start}
                                            suffix=" – "
                                        />
                                        <ClientTimestamp value={flame.timeline.end} />
                                    </p>
                                </div>
                                <div className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                    {String(flame.entity.state ?? "")}
                                </div>
                            </div>
                            <div className="mt-5">
                                <FlameDiagram
                                    frames={flame.frames}
                                    start={flame.timeline.start}
                                    end={flame.timeline.end}
                                    height={320}
                                />
                            </div>
                        </section>
                    )}
                    <RelatedEntitiesPanel
                        rootType="PR"
                        rootId={prId}
                        drilldown={drilldown}
                        investment={investment}
                        relatedEntitiesError={relatedEntitiesError}
                    />
                </main>
            </div>
        </div>
    );
}

function PrHeader({
    context,
}: {
    context?: { entityId: string; label: string; repositoryId: string };
} = {}) {
    return (
        <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
                <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                    Pull Request
                </p>
                <h1 className="mt-2 font-(--font-display) text-3xl">PR detail</h1>
                <p className="mt-2 text-sm text-(--ink-muted)">
                    Review persisted PR details, reviews, commits, and Work Graph evidence.
                </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                {context ? (
                    <AskDevTrigger
                        context={{
                            routeId: "pull_request_detail",
                            entityRefs: [
                                {
                                    entity_type: "pull_request",
                                    entity_id: context.entityId,
                                    display_label: context.label.slice(0, 120),
                                    repository_id: context.repositoryId,
                                },
                            ],
                            suggestedQuestionIds: [
                                "delivery_status",
                                "remaining_work",
                                "data_trust",
                            ],
                        }}
                    />
                ) : null}
                <BackLink area="Explore" href="/explore" />
            </div>
        </header>
    );
}
