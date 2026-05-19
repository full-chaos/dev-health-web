import { AIImpactDashboard } from "@/components/ai/AIImpactDashboard";
import { AIFilterBar } from "@/components/ai/AIFilterBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { decodeAIFilter, encodeAIFilterParam } from "@/lib/filters/ai";
import { defaultMetricFilter } from "@/lib/filters/defaults";

type AIImpactPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AIImpactPage({ searchParams }: AIImpactPageProps) {
  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const filter = decodeAIFilter(encodedFilter);
  const health = await checkApiHealth();

  if (!health.ok) {
    return <ServiceUnavailable />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={defaultMetricFilter} active="ai-impact" />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header>
            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">AI</p>
            <h1 className="mt-2 font-(--font-display) text-3xl">AI Impact</h1>
            <p className="mt-2 max-w-3xl text-sm text-(--ink-muted)">
              Org-wide view of how AI-assisted workflows appear to influence delivery, review load, quality gaps, and operational drag.
            </p>
          </header>

          <AIFilterBar filter={filter} />
          <AIImpactDashboard filter={filter} />
          <p className="sr-only">Encoded AI filter: {encodedFilter ?? encodeAIFilterParam(filter)}</p>
        </main>
      </div>
    </div>
  );
}
