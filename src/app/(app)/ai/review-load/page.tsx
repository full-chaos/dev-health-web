import { AIReviewLoadDashboard } from "@/components/ai/AIReviewLoadDashboard";
import { AIPageHeader } from "@/components/ai/AIPageHeader";
import { FilterBar } from "@/components/filters/FilterBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { metricFilterToAIFilter } from "@/lib/filters/ai";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";

type AIReviewLoadPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AIReviewLoadPage({ searchParams }: AIReviewLoadPageProps) {
  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);
  const aiFilter = metricFilterToAIFilter(filters);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="ai-review-load" />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <AIPageHeader eyebrow="AI workflows" title="AI Review Load">
            Diagnostic view for AI-generated review pressure, comparing AI-attributed work against
            the human baseline without person-level rankings.
          </AIPageHeader>
          <FilterBar view="ai" />
          <AIReviewLoadDashboard filter={aiFilter} />
        </main>
      </div>
    </div>
  );
}
