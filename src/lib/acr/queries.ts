export const ACR_REPOSITORY_SCOPES_QUERY = `query ACRRepositoryScopes($orgId: String!) {
  catalog(orgId: $orgId, dimension: REPO) {
    values {
      value
      count
    }
  }
}`;
