import { AIImpactDashboard } from "@/components/ai/AIImpactDashboard";
import { AIPageHeader } from "@/components/ai/AIPageHeader";
import { FilterBar } from "@/components/filters/FilterBar";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { encodeAIFilterParam, metricFilterToAIFilter } from "@/lib/filters/ai";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";

type AIWorkflowsPageProps = {
	searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

/**
 * `/ai` index — defaults to the Impact tab of the unified AI Workflows area.
 * Sidebar entry + tab strip are provided by the shared layout.
 */
export default async function AIWorkflowsPage({
	searchParams,
}: AIWorkflowsPageProps) {
	const params = (await searchParams) ?? {};
	const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
	const filters = encodedFilter
		? decodeFilter(encodedFilter)
		: filterFromQueryParams(params);
	const aiFilter = metricFilterToAIFilter(filters);
	const health = await checkApiHealth();

	if (!health.ok) {
		return <ServiceUnavailable />;
	}

	return (
		<>
			<AIPageHeader eyebrow="AI Workflows" title="Impact">
				Org-wide view of how AI-assisted workflows appear to influence delivery,
				review load, quality gaps, and operational drag.
			</AIPageHeader>

			<FilterBar view="ai" />
			<AIImpactDashboard filter={aiFilter} />
			<p className="sr-only">
				Encoded AI filter: {encodeAIFilterParam(aiFilter)}
			</p>
		</>
	);
}
