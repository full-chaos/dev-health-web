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
      }
    }
  }
}
`;

export const TESTOPS_RISK_QUERY = `
query TestOpsRisk($orgId: String!, $batch: AnalyticsRequestInput!) {
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

