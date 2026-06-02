import { AIImpactDashboard } from "@/components/ai/AIImpactDashboard";
import { AIPageHeader } from "@/components/ai/AIPageHeader";
import { FilterBar } from "@/components/filters/FilterBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { encodeAIFilterParam, metricFilterToAIFilter } from "@/lib/filters/ai";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";

type AIImpactPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AIImpactPage({ searchParams }: AIImpactPageProps) {
  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);
  const aiFilter = metricFilterToAIFilter(filters);
  const health = await checkApiHealth();

  if (!health.ok) {
    return <ServiceUnavailable />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="ai-workflows" />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <AIPageHeader
            eyebrow="AI"
            title="AI Impact"
            breadcrumbs={[
              { label: "Home", href: "/dashboard" },
              { label: "AI Workflow", href: "/ai/impact" },
              { label: "AI Impact" },
            ]}
          >
            Org-wide view of how AI-assisted workflows appear to influence delivery, review load,
            quality gaps, and operational drag.
          </AIPageHeader>

          <FilterBar view="ai" />
          <AIImpactDashboard filter={aiFilter} />
          <p className="sr-only">Encoded AI filter: {encodeAIFilterParam(aiFilter)}</p>
        </main>
      </div>
    </div>
  );
}
