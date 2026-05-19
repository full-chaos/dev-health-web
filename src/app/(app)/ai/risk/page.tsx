import { AIRiskDashboard } from "@/components/ai/AIRiskDashboard";
import { AIFilterBar } from "@/components/ai/AIFilterBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeAIFilter } from "@/lib/filters/ai";

type AIRiskPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AIRiskPage({ searchParams }: AIRiskPageProps) {
  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const filter = decodeAIFilter(encodedFilter);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={defaultMetricFilter} active="ai-risk" />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header>
            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">AI workflows</p>
            <h1 className="mt-2 font-(--font-display) text-3xl">AI Risk</h1>
            <p className="mt-2 max-w-3xl text-sm text-(--ink-muted)">
              Quality-risk diagnostics for AI-associated work, including baseline deltas, explicit missing-data states, and governance findings.
            </p>
          </header>
          <AIFilterBar filter={filter} />
          <AIRiskDashboard filter={filter} />
        </main>
      </div>
    </div>
  );
}
