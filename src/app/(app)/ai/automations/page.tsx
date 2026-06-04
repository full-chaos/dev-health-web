import { AIAutomationsDashboard } from "@/components/ai/AIAutomationsDashboard";
import { AIPageHeader } from "@/components/ai/AIPageHeader";
import { FilterBar } from "@/components/filters/FilterBar";
import { metricFilterToAIFilter } from "@/lib/filters/ai";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { navTrailForPathname } from "@/lib/navigation/areas";

type AIAutomationsPageProps = {
	searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AIAutomationsPage({
	searchParams,
}: AIAutomationsPageProps) {
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
				title="Automations"
				preview
				breadcrumbs={[
					...navTrailForPathname("/ai/automations").map((c) => ({ ...c, href: c.href ?? "/ai" })),
					{ label: "Automations" },
				]}
			>
				Candidate patterns for responsible automation, separated from Impact
				diagnostics so teams can triage opportunities directly.
			</AIPageHeader>
			<FilterBar view="ai" />
			<AIAutomationsDashboard filter={aiFilter} />
		</>
	);
}
