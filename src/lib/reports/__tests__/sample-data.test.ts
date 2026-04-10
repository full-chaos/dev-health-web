import { describe, it, expect } from "vitest";
import { sampleReports, sampleRuns } from "../sample-data";
import { ReportStatus } from "../types";

describe("Report Sample Data", () => {
  it("should have valid sample reports", () => {
    expect(sampleReports.length).toBeGreaterThan(0);
    
    const report = sampleReports[0];
    expect(report.id).toBeDefined();
    expect(report.name).toBeDefined();
    expect(report.scope.level).toBeDefined();
    expect(report.metrics.length).toBeGreaterThan(0);
  });

  it("should have valid sample runs linked to reports", () => {
    const reportId = sampleReports[0].id;
    const runs = sampleRuns[reportId];
    
    expect(runs).toBeDefined();
    expect(runs.length).toBeGreaterThan(0);
    
    const run = runs[0];
    expect(run.reportId).toBe(reportId);
    expect(Object.values(ReportStatus)).toContain(run.status);
  });

  it("should have rendered content for successful runs", () => {
    const reportId = "report-1";
    const runs = sampleRuns[reportId];
    const successfulRun = runs.find(r => r.status === ReportStatus.SUCCESS);
    
    expect(successfulRun).toBeDefined();
    expect(successfulRun?.renderedContent).toBeDefined();
    expect(typeof successfulRun?.renderedContent).toBe("string");
  });
});
