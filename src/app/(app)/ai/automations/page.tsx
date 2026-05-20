import { AIAutomationsDashboard } from "@/components/ai/AIAutomationsDashboard";
import { AIFilterBar } from "@/components/ai/AIFilterBar";
import { AIPageHeader } from "@/components/ai/AIPageHeader";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { decodeAIFilter } from "@/lib/filters/ai";
import { defaultMetricFilter } from "@/lib/filters/defaults";

type AIAutomationsPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AIAutomationsPage({ searchParams }: AIAutomationsPageProps) {
  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const filter = decodeAIFilter(encodedFilter);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={defaultMetricFilter} active="ai-opportunities" />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <AIPageHeader eyebrow="AI workflows" title="AI Automations">
            Candidate patterns for responsible automation, separated from Impact diagnostics so teams can triage opportunities directly.
          </AIPageHeader>
          <AIFilterBar filter={filter} />
          <AIAutomationsDashboard filter={filter} />
        </main>
      </div>
    </div>
  );
}
