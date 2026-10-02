import { FlameDiagram } from "@/components/charts/FlameDiagram";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { PageHeader } from "@/components/shell/PageHeader";
import { checkApiHealth } from "@/lib/api/system";
import { getFlame } from "@/lib/api/visuals";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { ClientTimestamp } from "@/components/ClientTimestamp";

type DeploymentDetailPageProps = {
    params: Promise<{ deployment_id: string }>;
};

export default async function DeploymentDetailPage({ params }: DeploymentDetailPageProps) {
    const health = await checkApiHealth();
    if (!health.ok) {
        return <ServiceUnavailable landmark={false} />;
    }

    const { deployment_id: deploymentId } = await params;
    const flame = await fetchOrNull(
        getFlame({ entity_type: "deployment", entity_id: deploymentId }),
        `deployments/${deploymentId}/flame`,
    );

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader
                title="Flame Diagram"
                subtitle="Track pipeline runtime and deploy handoffs."
                back={{ href: "/explore", area: "Explore" }}
            >
                {/* The trail says "Diagnose"; the label says which artifact this is. */}
                <span className="w-fit rounded-full border border-(--card-stroke) px-3 py-1 text-xs uppercase tracking-[0.18em] text-(--ink-muted)">
                    Deployment
                </span>
            </PageHeader>

            {!flame ? (
                <div className="rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-70) p-6 text-sm text-(--ink-muted)">
                    Flame data unavailable for this deployment.
                </div>
            ) : (
                <section className="rounded-3xl border border-(--card-stroke) bg-card p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="font-(--font-display) text-xl">
                                {String(flame.entity.deployment_id ?? "Deployment")}
                            </h2>
                            <p className="mt-2 text-xs text-(--ink-muted)">
                                <ClientTimestamp value={flame.timeline.start} suffix=" – " />
                                <ClientTimestamp value={flame.timeline.end} />
                            </p>
                        </div>
                        <div className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                            {String(flame.entity.environment ?? "")}
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
        </div>
    );
}
