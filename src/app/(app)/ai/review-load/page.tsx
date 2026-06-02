import { AIReviewLoadDashboard } from "@/components/ai/AIReviewLoadDashboard";
import { AIPageHeader } from "@/components/ai/AIPageHeader";
import { FilterBar } from "@/components/filters/FilterBar";
import { metricFilterToAIFilter } from "@/lib/filters/ai";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";

type AIReviewLoadPageProps = {
	searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AIReviewLoadPage({
	searchParams,
}: AIReviewLoadPageProps) {
	const params = (await searchParams) ?? {};
	const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
	const filters = encodedFilter
		? decodeFilter(encodedFilter)
		: filterFromQueryParams(params);
	const aiFilter = metricFilterToAIFilter(filters);

	return (
		<>
			<AIPageHeader eyebrow="AI Workflows" title="Review Load">
				Diagnostic view for AI-generated review pressure, comparing
				AI-attributed work against the human baseline without person-level
				rankings.
			</AIPageHeader>
			<FilterBar view="ai" />
			<AIReviewLoadDashboard filter={aiFilter} />
		</>
	);
}
