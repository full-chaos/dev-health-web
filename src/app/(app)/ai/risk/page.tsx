import { AIRiskDashboard } from "@/components/ai/AIRiskDashboard";
import { AIPageHeader } from "@/components/ai/AIPageHeader";
import { FilterBar } from "@/components/filters/FilterBar";
import { metricFilterToAIFilter } from "@/lib/filters/ai";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";

type AIRiskPageProps = {
	searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AIRiskPage({ searchParams }: AIRiskPageProps) {
	const params = (await searchParams) ?? {};
	const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
	const filters = encodedFilter
		? decodeFilter(encodedFilter)
		: filterFromQueryParams(params);
	const aiFilter = metricFilterToAIFilter(filters);

	return (
		<>
			<AIPageHeader
				eyebrow="AI Workflows"
				title="Governance Risk"
				breadcrumbs={[
					{ label: "Home", href: "/dashboard" },
					{ label: "AI Workflows", href: "/ai" },
					{ label: "Governance Risk" },
				]}
			>
				Quality-risk diagnostics for AI-associated work, including baseline
				deltas, explicit missing-data states, and governance findings.
			</AIPageHeader>
			<FilterBar view="ai" />
			<AIRiskDashboard filter={aiFilter} />
		</>
	);
}
