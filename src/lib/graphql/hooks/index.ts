/**
 * GraphQL hooks for dev-health-web.
 *
 * These hooks use urql for data fetching with automatic caching
 * and real-time subscriptions.
 */

export { useAnalytics, useBreakdown, useSankey } from "./useAnalytics";
export { useCatalog, useDimensionValues } from "./useCatalog";
export { useCapacityForecast } from "./useCapacityForecast";
export { useInvestmentMix, useInvestmentFlow, useInvestmentRepoTeamFlow } from "./useInvestment";
export {
    useMetricsUpdated,
    useTaskStatus,
    useSyncProgress,
    type MetricsUpdate,
    type TaskStatus,
    type SyncProgress,
} from "./useSubscription";
export {
    useWorkGraphEdges,
    useWorkGraphFlow,
    useWorkGraphArtifacts,
    useNodeEdges,
} from "./useWorkGraph";
export { useSecurityOverview, useSecurityAlerts } from "./useSecurity";
