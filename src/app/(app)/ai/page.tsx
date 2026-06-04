import { FilterBar } from "@/components/filters/FilterBar";
import { AreaOverview } from "@/components/navigation/AreaOverview";
import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { getAreaSignals } from "@/lib/areaSignals";
import { getServerEnv } from "@/lib/config";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";

type AIWorkflowsPageProps = {
	searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

/**
 * `/ai` index — the AI area overview. The shared AreaOverview summarizes and
 * routes to the real AI subviews; preview-only routes stay hidden from default
 * navigation until they have distinct views.
 */
export default async function AIWorkflowsPage({
	searchParams,
}: AIWorkflowsPageProps) {
	const params = (await searchParams) ?? {};
	const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
	const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
	const activeRole = typeof roleParam === "string" ? roleParam : undefined;
	const filters = encodedFilter
		? decodeFilter(encodedFilter)
		: filterFromQueryParams(params);

	const env = getServerEnv();
	const isTestMode =
		env.DEV_HEALTH_TEST_MODE === "true" ||
		env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

	const [health, aiSignals] = await Promise.all([
		checkApiHealth(),
		getAreaSignals("ai", filters, isTestMode),
	]);

	if (!health.ok && !isTestMode) {
		return <ServiceUnavailable />;
	}

	return (
		<>
			<GlobalContextBar filters={filters} />
			<FilterBar view="ai" />
			<AreaOverview
				areaId="ai"
				signals={aiSignals}
				filters={filters}
				role={activeRole}
				title="AI workflows"
				description="Real AI views that summarize impact, review pressure, governance risk, and automation opportunities."
			/>
		</>
	);
}
