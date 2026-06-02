import { AIAutomationsDashboard } from "@/components/ai/AIAutomationsDashboard";
import { AIPageHeader } from "@/components/ai/AIPageHeader";
import { FilterBar } from "@/components/filters/FilterBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { metricFilterToAIFilter } from "@/lib/filters/ai";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";

type AIAutomationsPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AIAutomationsPage({ searchParams }: AIAutomationsPageProps) {
  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);
  const aiFilter = metricFilterToAIFilter(filters);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="ai-workflows" />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <AIPageHeader
            eyebrow="AI workflows"
            title="AI Automations"
            preview
            breadcrumbs={[
              { label: "Home", href: "/dashboard" },
              { label: "AI Workflow", href: "/ai/impact" },
              { label: "AI Automations" },
            ]}
          >
            Repeatable work patterns surfaced as candidate opportunities for responsible automation,
            kept separate from Impact diagnostics so teams can triage them directly.
          </AIPageHeader>
          <FilterBar view="ai" />
          <AIAutomationsDashboard filter={aiFilter} />
        </main>
      </div>
    </div>
  );
}
