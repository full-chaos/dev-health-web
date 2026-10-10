/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
export type CompoundingRiskFilterInput = {
  breakout?: CompoundingRiskScope;
  day?: string | null | undefined;
  repoIds?: Array<string> | null | undefined;
  teamIds?: Array<string> | null | undefined;
  trendDays?: number;
};

export type CompoundingRiskScope =
  | 'REPO'
  | 'TEAM';

export type CompoundingRiskSeverity =
  | 'ELEVATED'
  | 'HIGH'
  | 'LOW'
  | 'UNKNOWN';

export type FilterInput = {
  how?: HowFilterInput | null | undefined;
  scope?: ScopeFilterInput | null | undefined;
  what?: WhatFilterInput | null | undefined;
  who?: WhoFilterInput | null | undefined;
  why?: WhyFilterInput | null | undefined;
};

/** Time window of the `home` query, the same members as `filters.time` of the REST home endpoint (range_days, compare_days, start_date, end_date). An unset member takes the REST default: 14, 14, no explicit dates. */
export type HomeWindowInput = {
  compareDays?: number | null | undefined;
  endDate?: string | null | undefined;
  rangeDays?: number | null | undefined;
  startDate?: string | null | undefined;
};

export type HowFilterInput = {
  flowStage?: Array<string> | null | undefined;
};

export type ScopeFilterInput = {
  ids?: Array<string>;
  level?: ScopeLevelInput;
};

export type ScopeLevelInput =
  | 'DEVELOPER'
  | 'ORG'
  | 'REPO'
  | 'SERVICE'
  | 'TEAM';

export type TeamAttributionConfidence =
  | 'HIGH'
  | 'LOW'
  | 'MANUAL'
  | 'MEDIUM'
  | 'NONE';

export type TeamAttributionSource =
  | 'ASSIGNEE_MEMBERSHIP'
  | 'AUTHOR_MEMBERSHIP'
  | 'ISSUE_PROJECT'
  | 'LINKED_ISSUE'
  | 'MANUAL_FALLBACK'
  | 'NATIVE_TEAM'
  | 'PROJECT_OWNERSHIP'
  | 'REPO_OWNERSHIP'
  | 'UNASSIGNED';

export type WhatFilterInput = {
  repos?: Array<string> | null | undefined;
  services?: Array<string> | null | undefined;
};

export type WhoFilterInput = {
  developers?: Array<string> | null | undefined;
  roles?: Array<string> | null | undefined;
};

export type WhyFilterInput = {
  issueType?: Array<string> | null | undefined;
  workCategory?: Array<string> | null | undefined;
};

export type GetConnectorsDataHealthQueryVariables = Exact<{
  teamId: string | number;
}>;


export type GetConnectorsDataHealthQuery = { dataHealth: { connectors: Array<{ provider: string, scope: string, lastSyncAt: string | null, rowsIngested: number, lastFailure: { occurredAt: string, message: string, stage: string | null } | null }> } };

export type DataHealthIdentityQueryVariables = Exact<{
  team: string | number;
}>;


export type DataHealthIdentityQuery = { dataHealth: { identityMapping: { unmappedCount: number, unmappedIdentities: Array<{ provider: string, email: string | null, displayName: string | null, observedCount: number | null }>, suggestedAliases: Array<{ suggestedCanonicalId: string, suggestedCanonicalName: string | null, confidence: number, unmappedIdentity: { provider: string, email: string | null, displayName: string | null } }> } } };

export type MetricLineageQueryVariables = Exact<{
  metricId: string | number;
}>;


export type MetricLineageQuery = { dataHealth: { metricLineage: { metricId: string, sourceTables: Array<string>, computedAt: string, rowCount: number | null, computeWindow: { kind: string, durationDays: number | null } } | null } };

export type GetMappingCoverageHealthQueryVariables = Exact<{
  teamId: string | number;
}>;


export type GetMappingCoverageHealthQuery = { dataHealth: { mappingCoverage: { deployments: { totalRepos: number, coveredRepos: number, coveragePct: number }, workItems: { totalRepos: number, coveredRepos: number, coveragePct: number } } } };

export type CompoundingRiskQueryVariables = Exact<{
  orgId: string;
  filter?: CompoundingRiskFilterInput | null | undefined;
}>;


export type CompoundingRiskQuery = { compoundingRisk: { __typename: 'CompoundingRiskResult', orgId: string, breakout: CompoundingRiskScope, generatedAt: string, rows: Array<{ __typename: 'CompoundingRiskPoint', day: string, scope: CompoundingRiskScope, scopeId: string, scopeLabel: string, score: number | null, coverage: number | null, severity: CompoundingRiskSeverity, computedAt: string, components: { __typename: 'CompoundingRiskComponents', churnNorm: number | null, complexityNorm: number | null, ownershipNorm: number | null, reviewNorm: number | null, reworkChurn: number | null, complexityDelta: number | null, ownershipGini: number | null, singleOwnerRatio: number | null, reviewLatencyP90h: number | null }, weights: { __typename: 'CompoundingRiskWeights', churn: number, complexity: number, ownership: number, review: number }, thresholds: { __typename: 'CompoundingRiskThresholds', elevated: number, high: number } }>, trend: Array<{ __typename: 'CompoundingRiskTrendPoint', day: string, score: number | null, severity: CompoundingRiskSeverity }> } };

export type HomeQueryVariables = Exact<{
  orgId: string;
  filters?: FilterInput | null | undefined;
  window?: HomeWindowInput | null | undefined;
}>;


export type HomeQuery = { home: { __typename: 'HomeResult', freshness: { __typename: 'Freshness', lastIngestedAt: string | null, latestSuccessfulSyncAt: string | null, sources: Array<{ __typename: 'HomeFreshnessSource', provider: string, status: string }>, coverage: { __typename: 'Coverage', reposCoveredPct: number | null, prsLinkedToIssuesPct: number | null, issuesWithCycleStatesPct: number | null } | null }, deltas: Array<{ __typename: 'MetricDelta', metric: string, label: string, value: number, unit: string, deltaPct: number | null, hasData: boolean, hasPriorData: boolean, rateState: string | null, rateCoverage: number | null, repoFilterApplied: boolean | null, repoLinkState: string | null, repoLinkMultiRepoItems: number | null, spark: Array<{ __typename: 'SparkPoint', ts: string, value: number }>, repoLinkBasis: { __typename: 'RepoLinkBasis', native: number, explicitText: number, heuristic: number } | null, repoLinkCoverage: { __typename: 'RepoLinkCoverage', linkedItems: number, itemsInWindow: number } | null }>, reworkThemeAllocation: Array<{ __typename: 'ReworkThemeAllocation', theme: string, label: string, allocation: number, allocationPct: number, prsMerged: number, churnLoc: number }>, summary: Array<{ __typename: 'SummarySentence', id: string, text: string, evidenceLink: string }>, tiles: Array<{ __typename: 'HomeTileEntry', key: string, value: { __typename: 'HomeTile', title: string, subtitle: string, link: string } }>, constraint: { __typename: 'ConstraintCard', title: string, claim: string, experiments: Array<string>, evidence: Array<{ __typename: 'ConstraintEvidence', label: string, link: string }> } | null, events: Array<{ __typename: 'EventItem', ts: string, type: string, text: string, link: string }>, healthState: { __typename: 'HealthState', status: string, headline: string, summary: string, asOf: string | null }, signals: Array<{ __typename: 'HomeSignal', id: string, title: string, metric: string, currentValue: string, priorValue: string | null, delta: string | null, direction: string, severity: string, confidence: string, affectedScope: string, evidenceCount: number, whyItMatters: string, recommendedAction: string, evidenceRef: string | null, category: string, coverage: number | null, repoFilterApplied: boolean | null, scopeEntity: { __typename: 'ScopeEntityRef', id: string, displayName: string } | null, attribution: { __typename: 'SignalAttribution', items: number, sources: Array<{ __typename: 'SignalAttributionSourceCount', source: TeamAttributionSource, items: number, share: number }>, confidence: Array<{ __typename: 'SignalAttributionConfidenceCount', confidence: TeamAttributionConfidence, items: number, share: number }> } | null }>, limitingFactor: { __typename: 'HomeLimitingFactor', claim: string, whyItMatters: string, recommendedAction: string, confidence: string, evidenceRef: string | null }, dataConfidence: { __typename: 'HomeDataConfidence', level: string, coveragePct: number | null, connectedSources: Array<string>, missingSources: Array<string>, caveats: Array<string> }, scopeDataConfidence: { __typename: 'HomeScopeDataConfidence', level: string, coveragePct: number | null, lastIngestedAt: string | null, caveats: Array<string> } } };

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
        suggestedCanonicalName
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
export const CompoundingRiskDocument = new TypedDocumentString(`
    query CompoundingRisk($orgId: String!, $filter: CompoundingRiskFilterInput = null) {
  compoundingRisk(orgId: $orgId, filter: $filter) {
    orgId
    breakout
    generatedAt
    rows {
      day
      scope
      scopeId
      scopeLabel
      score
      coverage
      severity
      computedAt
      components {
        churnNorm
        complexityNorm
        ownershipNorm
        reviewNorm
        reworkChurn
        complexityDelta
        ownershipGini
        singleOwnerRatio
        reviewLatencyP90h
        __typename
      }
      weights {
        churn
        complexity
        ownership
        review
        __typename
      }
      thresholds {
        elevated
        high
        __typename
      }
      __typename
    }
    trend {
      day
      score
      severity
      __typename
    }
    __typename
  }
}
    `) as unknown as TypedDocumentString<CompoundingRiskQuery, CompoundingRiskQueryVariables>;
export const HomeDocument = new TypedDocumentString(`
    query Home($orgId: String!, $filters: FilterInput, $window: HomeWindowInput) {
  home(orgId: $orgId, filters: $filters, window: $window) {
    freshness {
      lastIngestedAt
      latestSuccessfulSyncAt
      sources {
        provider
        status
        __typename
      }
      coverage {
        reposCoveredPct
        prsLinkedToIssuesPct
        issuesWithCycleStatesPct
        __typename
      }
      __typename
    }
    deltas {
      metric
      label
      value
      unit
      deltaPct
      hasData
      hasPriorData
      spark {
        ts
        value
        __typename
      }
      rateState
      rateCoverage
      repoFilterApplied
      repoLinkState
      repoLinkBasis {
        native
        explicitText
        heuristic
        __typename
      }
      repoLinkMultiRepoItems
      repoLinkCoverage {
        linkedItems
        itemsInWindow
        __typename
      }
      __typename
    }
    reworkThemeAllocation {
      theme
      label
      allocation
      allocationPct
      prsMerged
      churnLoc
      __typename
    }
    summary {
      id
      text
      evidenceLink
      __typename
    }
    tiles {
      key
      value {
        title
        subtitle
        link
        __typename
      }
      __typename
    }
    constraint {
      title
      claim
      evidence {
        label
        link
        __typename
      }
      experiments
      __typename
    }
    events {
      ts
      type
      text
      link
      __typename
    }
    healthState {
      status
      headline
      summary
      asOf
      __typename
    }
    signals {
      id
      title
      metric
      currentValue
      priorValue
      delta
      direction
      severity
      confidence
      affectedScope
      evidenceCount
      whyItMatters
      recommendedAction
      evidenceRef
      category
      scopeEntity {
        id
        displayName
        __typename
      }
      coverage
      repoFilterApplied
      attribution {
        items
        sources {
          source
          items
          share
          __typename
        }
        confidence {
          confidence
          items
          share
          __typename
        }
        __typename
      }
      __typename
    }
    limitingFactor {
      claim
      whyItMatters
      recommendedAction
      confidence
      evidenceRef
      __typename
    }
    dataConfidence {
      level
      coveragePct
      connectedSources
      missingSources
      caveats
      __typename
    }
    scopeDataConfidence {
      level
      coveragePct
      lastIngestedAt
      caveats
      __typename
    }
    __typename
  }
}
    `) as unknown as TypedDocumentString<HomeQuery, HomeQueryVariables>;