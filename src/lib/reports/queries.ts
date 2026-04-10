export const SAVED_REPORTS_QUERY = `
query savedReports($orgId: String!, $limit: Int, $offset: Int) {
  savedReports(orgId: $orgId, limit: $limit, offset: $offset) {
    items {
      id
      name
      description
      isTemplate
      isActive
      lastRunAt
      lastRunStatus
      createdAt
      updatedAt
    }
    total
  }
}
`;

export const SAVED_REPORT_QUERY = `
query savedReport($orgId: String!, $reportId: String!) {
  savedReport(orgId: $orgId, reportId: $reportId) {
    id
    name
    description
    isTemplate
    isActive
    lastRunAt
    lastRunStatus
    createdAt
    updatedAt
  }
}
`;

export const REPORT_RUNS_QUERY = `
query reportRuns($orgId: String!, $reportId: String!, $limit: Int) {
  reportRuns(orgId: $orgId, reportId: $reportId, limit: $limit) {
    items {
      id
      reportId
      status
      startedAt
      completedAt
      error
      resultUrl
    }
    total
  }
}
`;

export const CREATE_REPORT_MUTATION = `
mutation createSavedReport($orgId: String!, $name: String!, $description: String, $isTemplate: Boolean) {
  createSavedReport(orgId: $orgId, name: $name, description: $description, isTemplate: $isTemplate) {
    id
    name
    description
    isTemplate
    isActive
    createdAt
    updatedAt
  }
}
`;

export const TRIGGER_REPORT_MUTATION = `
mutation triggerReport($orgId: String!, $reportId: String!) {
  triggerReport(orgId: $orgId, reportId: $reportId) {
    id
    reportId
    status
    startedAt
  }
}
`;
