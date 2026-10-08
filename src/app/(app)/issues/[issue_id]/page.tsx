import { servedEntityName } from "@/lib/labels/unresolved";
import { NoOrgNotice } from "@/components/NoOrgNotice";
import { FlameDiagram } from "@/components/charts/FlameDiagram";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { PageHeader } from "@/components/shell/PageHeader";
import { checkApiHealth } from "@/lib/api/system";
import { getFlame } from "@/lib/api/visuals";
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
        return <ServiceUnavailable landmark={false} />;
    }

    const { issue_id: issueId } = await params;
    const session = await requireSession();
    const orgId = session.user.org_id;
    // No org on the session: ask for nothing (never an empty or made-up org).
    if (!orgId) return <NoOrgNotice />;
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
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader
                title="Flame Diagram"
                subtitle="Track backlog wait time versus active work time."
                back={{ href: "/explore", area: "Explore" }}
            >
                {/* The trail says "Diagnose"; the label says which artifact this is. */}
                <span className="w-fit rounded-full border border-(--card-stroke) px-3 py-1 text-xs uppercase tracking-[0.18em] text-(--ink-muted)">
                    Issue
                </span>
            </PageHeader>

            {!flame?.entity || !flame.timeline || !flame.frames ? (
                <div className="rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-70) p-6 text-sm text-(--ink-muted)">
                    Flame data unavailable for this issue.
                </div>
            ) : (
                <section className="rounded-3xl border border-(--card-stroke) bg-(--card) p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="font-(--font-display) text-xl">
                                {servedEntityName(flame.entity, "title")}
                            </h2>
                            <p className="mt-2 text-xs text-(--ink-muted)">
                                <ClientTimestamp value={flame.timeline.start} suffix=" – " />
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
        </div>
    );
}
