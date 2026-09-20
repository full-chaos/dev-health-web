/**
 * GraphQL hooks for dev-health-web.
 *
 * These hooks use urql for data fetching with automatic caching.
 */

export { useAnalytics, useBreakdown, useSankey } from "./useAnalytics";
export { useCatalog, useDimensionValues } from "./useCatalog";
export { useCapacityForecast } from "./useCapacityForecast";
export {
    useInvestmentMix,
    useInvestmentFlow,
    useInvestmentRepoTeamFlow,
    useWorkUnitTeamAttributions,
} from "./useInvestment";
export {
    useWorkGraphEdges,
    useWorkGraphFlow,
    useWorkGraphArtifacts,
    useNodeEdges,
} from "./useWorkGraph";
export { useSecurityOverview, useSecurityAlerts } from "./useSecurity";
