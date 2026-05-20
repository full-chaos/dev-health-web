/* eslint-disable */
import * as types from './graphql';



/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "query GetConnectorsDataHealth($teamId: ID!) {\n  dataHealth(team: $teamId) {\n    connectors {\n      provider\n      scope\n      lastSyncAt\n      rowsIngested\n      lastFailure {\n        occurredAt\n        message\n        stage\n      }\n    }\n  }\n}": typeof types.GetConnectorsDataHealthDocument,
    "query DataHealthIdentity($team: ID!) {\n  dataHealth(team: $team) {\n    identityMapping {\n      unmappedCount\n      unmappedIdentities {\n        provider\n        email\n        displayName\n        observedCount\n      }\n      suggestedAliases {\n        unmappedIdentity {\n          provider\n          email\n          displayName\n        }\n        suggestedCanonicalId\n        confidence\n      }\n    }\n  }\n}": typeof types.DataHealthIdentityDocument,
    "query MetricLineage($metricId: ID!) {\n  dataHealth(team: \"ALL\") {\n    metricLineage(metricId: $metricId) {\n      metricId\n      sourceTables\n      computeWindow {\n        kind\n        durationDays\n      }\n      computedAt\n      rowCount\n    }\n  }\n}": typeof types.MetricLineageDocument,
    "query GetMappingCoverageHealth($teamId: ID!) {\n  dataHealth(team: $teamId) {\n    mappingCoverage {\n      deployments {\n        totalRepos\n        coveredRepos\n        coveragePct\n      }\n      workItems {\n        totalRepos\n        coveredRepos\n        coveragePct\n      }\n    }\n  }\n}": typeof types.GetMappingCoverageHealthDocument,
};
const documents: Documents = {
    "query GetConnectorsDataHealth($teamId: ID!) {\n  dataHealth(team: $teamId) {\n    connectors {\n      provider\n      scope\n      lastSyncAt\n      rowsIngested\n      lastFailure {\n        occurredAt\n        message\n        stage\n      }\n    }\n  }\n}": types.GetConnectorsDataHealthDocument,
    "query DataHealthIdentity($team: ID!) {\n  dataHealth(team: $team) {\n    identityMapping {\n      unmappedCount\n      unmappedIdentities {\n        provider\n        email\n        displayName\n        observedCount\n      }\n      suggestedAliases {\n        unmappedIdentity {\n          provider\n          email\n          displayName\n        }\n        suggestedCanonicalId\n        confidence\n      }\n    }\n  }\n}": types.DataHealthIdentityDocument,
    "query MetricLineage($metricId: ID!) {\n  dataHealth(team: \"ALL\") {\n    metricLineage(metricId: $metricId) {\n      metricId\n      sourceTables\n      computeWindow {\n        kind\n        durationDays\n      }\n      computedAt\n      rowCount\n    }\n  }\n}": types.MetricLineageDocument,
    "query GetMappingCoverageHealth($teamId: ID!) {\n  dataHealth(team: $teamId) {\n    mappingCoverage {\n      deployments {\n        totalRepos\n        coveredRepos\n        coveragePct\n      }\n      workItems {\n        totalRepos\n        coveredRepos\n        coveragePct\n      }\n    }\n  }\n}": types.GetMappingCoverageHealthDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query GetConnectorsDataHealth($teamId: ID!) {\n  dataHealth(team: $teamId) {\n    connectors {\n      provider\n      scope\n      lastSyncAt\n      rowsIngested\n      lastFailure {\n        occurredAt\n        message\n        stage\n      }\n    }\n  }\n}"): typeof import('./graphql').GetConnectorsDataHealthDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query DataHealthIdentity($team: ID!) {\n  dataHealth(team: $team) {\n    identityMapping {\n      unmappedCount\n      unmappedIdentities {\n        provider\n        email\n        displayName\n        observedCount\n      }\n      suggestedAliases {\n        unmappedIdentity {\n          provider\n          email\n          displayName\n        }\n        suggestedCanonicalId\n        confidence\n      }\n    }\n  }\n}"): typeof import('./graphql').DataHealthIdentityDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query MetricLineage($metricId: ID!) {\n  dataHealth(team: \"ALL\") {\n    metricLineage(metricId: $metricId) {\n      metricId\n      sourceTables\n      computeWindow {\n        kind\n        durationDays\n      }\n      computedAt\n      rowCount\n    }\n  }\n}"): typeof import('./graphql').MetricLineageDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query GetMappingCoverageHealth($teamId: ID!) {\n  dataHealth(team: $teamId) {\n    mappingCoverage {\n      deployments {\n        totalRepos\n        coveredRepos\n        coveragePct\n      }\n      workItems {\n        totalRepos\n        coveredRepos\n        coveragePct\n      }\n    }\n  }\n}"): typeof import('./graphql').GetMappingCoverageHealthDocument;


export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}
