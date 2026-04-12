export const SAVED_REPORTS_QUERY = `
query savedReports($orgId: String!, $limit: Int, $offset: Int) {
  savedReports(orgId: $orgId, limit: $limit, offset: $offset) {
    items {
      id
      orgId
      name
      description
      reportPlan
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
    orgId
    name
    description
    reportPlan
    isTemplate
    templateSourceId
    parameters
    scheduleId
    isActive
    lastRunAt
    lastRunStatus
    createdAt
    updatedAt
    createdBy
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
      durationSeconds
      renderedMarkdown
      artifactUrl
      provenanceRecords
      error
      triggeredBy
      createdAt
    }
    total
  }
}
`;

export const CREATE_REPORT_MUTATION = `
mutation createSavedReport($orgId: String!, $input: CreateSavedReportInput!) {
  createSavedReport(orgId: $orgId, input: $input) {
    id
    orgId
    name
    description
    reportPlan
    isTemplate
    isActive
    createdAt
    updatedAt
  }
}
`;

export const UPDATE_REPORT_MUTATION = `
mutation updateSavedReport($orgId: String!, $reportId: String!, $input: UpdateSavedReportInput!) {
  updateSavedReport(orgId: $orgId, reportId: $reportId, input: $input) {
    id
    orgId
    name
    description
    reportPlan
    isTemplate
    parameters
    scheduleId
    isActive
    lastRunAt
    lastRunStatus
    createdAt
    updatedAt
  }
}
`;

export const CLONE_REPORT_MUTATION = `
mutation cloneSavedReport($orgId: String!, $input: CloneSavedReportInput!) {
  cloneSavedReport(orgId: $orgId, input: $input) {
    id
    orgId
    name
    description
    isActive
    createdAt
    updatedAt
  }
}
`;

export const DELETE_REPORT_MUTATION = `
mutation deleteSavedReport($orgId: String!, $reportId: String!) {
  deleteSavedReport(orgId: $orgId, reportId: $reportId)
}
`;

export const TRIGGER_REPORT_MUTATION = `
mutation triggerReport($orgId: String!, $reportId: String!) {
  triggerReport(orgId: $orgId, reportId: $reportId) {
    id
    reportId
    status
    startedAt
    triggeredBy
  }
}
`;
