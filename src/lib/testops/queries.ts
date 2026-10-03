export const TESTOPS_PIPELINE_QUERY = `
query TestOpsPipeline($orgId: String!, $batch: AnalyticsRequestInput!) {
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
    breakdowns {
      dimension
      measure
      items {
        key
        value
      }
    }
  }
}
`;

export const TESTOPS_TEST_QUERY = `
query TestOpsTest($orgId: String!, $batch: AnalyticsRequestInput!) {
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
    breakdowns {
      dimension
      measure
      items {
        key
        value
      }
    }
  }
}
`;

export const TESTOPS_COVERAGE_QUERY = `
query TestOpsCoverage($orgId: String!, $batch: AnalyticsRequestInput!) {
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
    breakdowns {
      dimension
      measure
items {
key
        value
        label
}
    }
  }
}
`;

export const TESTOPS_RISK_QUERY = `
query TestOpsRisk($orgId: String!, $input: TestOpsRiskInput!) {
  testopsRisk(orgId: $orgId, input: $input) {
    releaseConfidence
    qualityDragHours
    pipelineStability
    timeseries {
      date
      riskScore
    }
    qualityDragBreakdown {
      category
      hours
    }
    quadrantData {
      id
      pipelineSuccessRate
      testPassRate
    }
    confidenceSpark {
      ts
      value
    }
    confidenceDelta
    dragSpark {
      ts
      value
    }
    dragDelta
    stabilitySpark {
      ts
      value
    }
    stabilityDelta
  }
}
`;

// Coverage baseline per repository: its own mean coverage over the 30 days before `endDate` (that
// day is not included). Percent, 0 to 100; null = no baseline. The text is registered on the API
// side.
export const TESTOPS_COVERAGE_BASELINES_QUERY = `
query CoverageBaselines($orgId: String!, $endDate: Date!, $repoIds: [String!], $teamIds: [String!]) {
  coverageBaselines(orgId: $orgId, endDate: $endDate, repoIds: $repoIds, teamIds: $teamIds) {
    repoId
    repoName
    lineBaselinePct
    lineDays
    branchBaselinePct
    branchDays
  }
}
`;

// Failing workflows and jobs (CHAOS-8514). One group per (workflow name, job name, provider);
// `failureRate` is a share from 0 to 1. The text is registered on the API side.
export const TESTOPS_JOB_FAILURES_QUERY = `
query TestOpsJobFailures($orgId: String!, $input: TestOpsJobFailuresInput!) {
  testopsJobFailures(orgId: $orgId, input: $input) {
    groups {
      workflowName
      jobName
      provider
      runs
      failedRuns
      failureRate
    }
    totalCount
    truncated
  }
}
`;
