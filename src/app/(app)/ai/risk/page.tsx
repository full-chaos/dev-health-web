import { AIRiskDashboard } from "@/components/ai/AIRiskDashboard";
import { AIFilterBar } from "@/components/ai/AIFilterBar";
import { AIPageHeader } from "@/components/ai/AIPageHeader";
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
          <AIPageHeader eyebrow="AI workflows" title="AI Risk">
            Quality-risk diagnostics for AI-associated work, including baseline deltas, explicit missing-data states, and governance findings.
          </AIPageHeader>
          <AIFilterBar filter={filter} />
          <AIRiskDashboard filter={filter} />
        </main>
      </div>
    </div>
  );
}
