import Link from "next/link";

import { AskDevTrigger } from "@/components/ask-dev/AskDevTrigger";
import { FlameDiagram } from "@/components/charts/FlameDiagram";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { getFlame } from "@/lib/api/visuals";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { ClientTimestamp } from "@/components/ClientTimestamp";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { RelatedEntitiesPanel } from "@/components/work/RelatedEntitiesPanel";
import { requireSession } from "@/lib/auth";
import {
    getAIWorkflowDrilldownViaGraphQL,
    getWorkUnitInvestmentDistribution,
} from "@/lib/graphql/workGraphFetchers";

type IssueDetailPageProps = {
    params: Promise<{ issue_id: string }>;
};

export default async function IssueDetailPage({ params }: IssueDetailPageProps) {
    const health = await checkApiHealth();
    if (!health.ok) {
        return <ServiceUnavailable />;
    }

    const { issue_id: issueId } = await params;
    const session = await requireSession();
    const orgId = session.user.org_id ?? "default-org";
    const [flame, drilldown] = await Promise.all([
        fetchOrNull(getFlame({ entity_type: "issue", entity_id: issueId }), "issue-flame"),
        getAIWorkflowDrilldownViaGraphQL({
            orgId,
            rootType: "ISSUE",
            rootId: issueId,
            useDemoFallback: true,
        }),
    ]);
    const investment = getWorkUnitInvestmentDistribution({ rootType: "ISSUE", rootId: issueId });

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <PrimaryNav filters={defaultMetricFilter} />
                <main className="flex min-w-0 flex-1 flex-col gap-8">
                    <header className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                                Issue
                            </p>
                            <h1 className="mt-2 font-(--font-display) text-3xl">Flame Diagram</h1>
                            <p className="mt-2 text-sm text-(--ink-muted)">
                                Track backlog wait time versus active work time.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <AskDevTrigger
                                context={{
                                    routeId: "issue_detail",
                                    entityRefs: [
                                        {
                                            entity_type: "issue",
                                            entity_id: issueId,
                                            display_label: String(
                                                flame?.entity?.work_item_id ?? issueId,
                                            ).slice(0, 120),
                                        },
                                    ],
                                    suggestedQuestionIds: ["remaining_work", "data_trust"],
                                }}
                            />
                            <Link
                                href="/explore"
                                className="rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em]"
                            >
                                Back to Explore
                            </Link>
                        </div>
                    </header>

                    {!flame?.entity || !flame.timeline || !flame.frames ? (
                        <div className="rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-70) p-6 text-sm text-(--ink-muted)">
                            Flame data unavailable for this issue.
                        </div>
                    ) : (
                        <section className="rounded-3xl border border-(--card-stroke) bg-(--card) p-6">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h2 className="font-(--font-display) text-xl">
                                        {String(flame.entity.work_item_id ?? "Issue")}
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
                                    {String(flame.entity.status ?? "")}
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
                        rootType="ISSUE"
                        rootId={issueId}
                        drilldown={drilldown}
                        investment={investment}
                    />
                </main>
            </div>
        </div>
    );
}
