import { describe, it, expect } from "vitest";
import { fetchRiskMetrics } from "../fetchers";
import { SAMPLE_RISK_DATA } from "../sample-data";

describe("fetchRiskMetrics", () => {
  it("returns sample data when isTestMode is true", async () => {
    const result = await fetchRiskMetrics("default-org", { timeseries: [], breakdowns: [] }, true);
    expect(result).toEqual(SAMPLE_RISK_DATA);
  });
});
