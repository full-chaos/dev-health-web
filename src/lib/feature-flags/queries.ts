export const FEATURE_FLAG_REGISTRY_QUERY = `
query FeatureFlagRegistry($orgId: String!, $provider: String, $project: String, $includeArchived: Boolean, $limit: Int!) {
  featureFlags(orgId: $orgId, provider: $provider, project: $project, includeArchived: $includeArchived, limit: $limit) {
    flags {
      flagId
      flagKey
      provider
      projectKey
      environment
      flagType
      createdAt
      archivedAt
    }
    totalCount
    degradedReason
  }
}
`;

export const FEATURE_FLAG_EVENTS_QUERY = `
query FeatureFlagEvents($orgId: String!, $flagKey: String, $environment: String, $limit: Int!) {
  featureFlagEvents(orgId: $orgId, flagKey: $flagKey, environment: $environment, limit: $limit) {
    events {
      flagKey
      eventType
      prevState
      nextState
      actorType
      environment
      eventTs
    }
    totalCount
    degradedReason
  }
}
`;

export const FEATURE_FLAG_TIMESERIES_QUERY = `
query FeatureFlagTimeseries($orgId: String!, $batch: AnalyticsRequestInput!) {
  analytics(orgId: $orgId, batch: $batch) {
    timeseries {
      dimension
      dimensionValue
      measure
      buckets {
        date
        value
      }
    }
  }
}
`;

export const RELEASE_IMPACT_QUERY = `
query ReleaseImpact($orgId: String!, $filters: WorkGraphEdgeFilterInput) {
  workGraphEdges(orgId: $orgId, filters: $filters) {
    edges {
      edgeId
      sourceType
      sourceId
      targetType
      targetId
      edgeType
      provenance
      confidence
      evidence
      repoId
      provider
    }
    totalCount
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
  }
}
`;
