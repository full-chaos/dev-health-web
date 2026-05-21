/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
export type GetConnectorsDataHealthQueryVariables = Exact<{
  teamId: string | number;
}>;


export type GetConnectorsDataHealthQuery = { dataHealth: { connectors: Array<{ provider: string, scope: string, lastSyncAt: string | null, rowsIngested: number, lastFailure: { occurredAt: string, message: string, stage: string | null } | null }> } };

export type DataHealthIdentityQueryVariables = Exact<{
  team: string | number;
}>;


export type DataHealthIdentityQuery = { dataHealth: { identityMapping: { unmappedCount: number, unmappedIdentities: Array<{ provider: string, email: string | null, displayName: string | null, observedCount: number | null }>, suggestedAliases: Array<{ suggestedCanonicalId: string, confidence: number, unmappedIdentity: { provider: string, email: string | null, displayName: string | null } }> } } };

export type MetricLineageQueryVariables = Exact<{
  metricId: string | number;
}>;


export type MetricLineageQuery = { dataHealth: { metricLineage: { metricId: string, sourceTables: Array<string>, computedAt: string, rowCount: number | null, computeWindow: { kind: string, durationDays: number | null } } | null } };

export type GetMappingCoverageHealthQueryVariables = Exact<{
  teamId: string | number;
}>;


export type GetMappingCoverageHealthQuery = { dataHealth: { mappingCoverage: { deployments: { totalRepos: number, coveredRepos: number, coveragePct: number }, workItems: { totalRepos: number, coveredRepos: number, coveragePct: number } } } };

export class TypedDocumentString<TResult, TVariables>
  extends String
  implements DocumentTypeDecoration<TResult, TVariables>
{
  __apiType?: NonNullable<DocumentTypeDecoration<TResult, TVariables>['__apiType']>;
  private value: string;
  public __meta__?: Record<string, any> | undefined;

  constructor(value: string, __meta__?: Record<string, any> | undefined) {
    super(value);
    this.value = value;
    this.__meta__ = __meta__;
  }

  override toString(): string & DocumentTypeDecoration<TResult, TVariables> {
    return this.value;
  }
}

export const GetConnectorsDataHealthDocument = new TypedDocumentString(`
    query GetConnectorsDataHealth($teamId: ID!) {
  dataHealth(team: $teamId) {
    connectors {
      provider
      scope
      lastSyncAt
      rowsIngested
      lastFailure {
        occurredAt
        message
        stage
      }
    }
  }
}
    `) as unknown as TypedDocumentString<GetConnectorsDataHealthQuery, GetConnectorsDataHealthQueryVariables>;
export const DataHealthIdentityDocument = new TypedDocumentString(`
    query DataHealthIdentity($team: ID!) {
  dataHealth(team: $team) {
    identityMapping {
      unmappedCount
      unmappedIdentities {
        provider
        email
        displayName
        observedCount
      }
      suggestedAliases {
        unmappedIdentity {
          provider
          email
          displayName
        }
        suggestedCanonicalId
        confidence
      }
    }
  }
}
    `) as unknown as TypedDocumentString<DataHealthIdentityQuery, DataHealthIdentityQueryVariables>;
export const MetricLineageDocument = new TypedDocumentString(`
    query MetricLineage($metricId: ID!) {
  dataHealth(team: "ALL") {
    metricLineage(metricId: $metricId) {
      metricId
      sourceTables
      computeWindow {
        kind
        durationDays
      }
      computedAt
      rowCount
    }
  }
}
    `) as unknown as TypedDocumentString<MetricLineageQuery, MetricLineageQueryVariables>;
export const GetMappingCoverageHealthDocument = new TypedDocumentString(`
    query GetMappingCoverageHealth($teamId: ID!) {
  dataHealth(team: $teamId) {
    mappingCoverage {
      deployments {
        totalRepos
        coveredRepos
        coveragePct
      }
      workItems {
        totalRepos
        coveredRepos
        coveragePct
      }
    }
  }
}
    `) as unknown as TypedDocumentString<GetMappingCoverageHealthQuery, GetMappingCoverageHealthQueryVariables>;