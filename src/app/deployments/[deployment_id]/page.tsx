import Link from "next/link";

import { FlameDiagram } from "@/components/charts/FlameDiagram";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth, getFlame } from "@/lib/api";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { formatTimestamp } from "@/lib/formatters";

type DeploymentDetailPageProps = {
  params: Promise<{ deployment_id: string }>;
};

export default async function DeploymentDetailPage({
  params,
}: DeploymentDetailPageProps) {
  const health = await checkApiHealth();
  if (!health.ok) {
    return <ServiceUnavailable />;
  }

  const { deployment_id: deploymentId } = await params;
  const flame = await getFlame({
    entity_type: "deployment",
    entity_id: deploymentId,
  }).catch(() => null);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={defaultMetricFilter} />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-(--ink-muted)">
                Deployment
              </p>
              <h1 className="mt-2 font-(--font-display) text-3xl">
                Flame Diagram
              </h1>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Track pipeline runtime and deploy handoffs.
              </p>
            </div>
            <Link
              href="/explore"
              className="rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em]"
            >
              Back to Explore
            </Link>
          </header>

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
                    {formatTimestamp(flame.timeline.start)} – {formatTimestamp(flame.timeline.end)}
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
        </main>
      </div>
    </div>
  );
}
