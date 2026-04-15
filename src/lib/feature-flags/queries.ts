export const FEATURE_FLAG_REGISTRY_QUERY = `
query FeatureFlagRegistry($orgId: String!, $filters: WorkGraphEdgeFilterInput) {
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

export const FEATURE_FLAG_EVENTS_QUERY = `
query FeatureFlagEvents($orgId: String!, $filters: WorkGraphEdgeFilterInput) {
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
