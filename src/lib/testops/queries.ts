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
