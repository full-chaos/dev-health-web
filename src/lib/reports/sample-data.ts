import { ReportStatus, type SavedReport, type ReportRun } from "./types";

export const sampleRuns: Record<string, ReportRun[]> = {
  "report-1": [
    {
      id: "run-1-1",
      reportId: "report-1",
      status: ReportStatus.SUCCESS,
      durationSeconds: 45,
      triggeredBy: "scheduled",
      startedAt: "2026-04-09T08:00:00Z",
      completedAt: "2026-04-09T08:00:45Z",
      createdAt: "2026-04-09T08:00:00Z",
      renderedMarkdown:
        "# Weekly Engineering Health\n\n## Summary\nEverything looks good this week. DORA metrics are stable.\n\n## Metrics\n- Deployment Frequency: 4.2/day\n- Lead Time for Changes: 1.2 days\n- Change Failure Rate: 2.1%\n- Time to Restore Service: 1.5 hours",
    },
    {
      id: "run-1-2",
      reportId: "report-1",
      status: ReportStatus.SUCCESS,
      durationSeconds: 42,
      triggeredBy: "scheduled",
      startedAt: "2026-04-02T08:00:00Z",
      completedAt: "2026-04-02T08:00:42Z",
      createdAt: "2026-04-02T08:00:00Z",
    },
  ],
  "report-2": [
    {
      id: "run-2-1",
      reportId: "report-2",
      status: ReportStatus.FAILED,
      durationSeconds: 12,
      triggeredBy: "manual",
      startedAt: "2026-04-10T10:15:00Z",
      completedAt: "2026-04-10T10:15:12Z",
      createdAt: "2026-04-10T10:15:00Z",
      error: "Failed to fetch data from GitHub API: Rate limit exceeded",
    },
  ],
  "report-3": [
    {
      id: "run-3-1",
      reportId: "report-3",
      status: ReportStatus.RUNNING,
      durationSeconds: 15,
      triggeredBy: "manual",
      startedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
  ],
};

export const sampleReports: SavedReport[] = [
  {
    id: "report-1",
    orgId: "default-org",
    name: "Weekly Engineering Health",
    description: "Overview of DORA metrics and team health indicators for the past week.",
    reportPlan: {},
    isTemplate: false,
    isActive: true,
    lastRunAt: "2026-04-09T08:00:45Z",
    lastRunStatus: "success",
    createdAt: "2026-03-01T12:00:00Z",
    updatedAt: "2026-04-01T12:00:00Z",
  },
  {
    id: "report-2",
    orgId: "default-org",
    name: "Frontend Team Quality",
    description:
      "Deep dive into test coverage, CI success rates, and bug reports for the frontend team.",
    reportPlan: {},
    isTemplate: false,
    isActive: true,
    lastRunAt: "2026-04-10T10:15:12Z",
    lastRunStatus: "failed",
    createdAt: "2026-03-15T09:30:00Z",
    updatedAt: "2026-03-15T09:30:00Z",
  },
  {
    id: "report-3",
    orgId: "default-org",
    name: "Backend API Performance",
    description: "Latency and error rate analysis for core API services.",
    reportPlan: {},
    isTemplate: false,
    isActive: true,
    lastRunStatus: "running",
    createdAt: "2026-04-05T14:20:00Z",
    updatedAt: "2026-04-08T11:10:00Z",
  },
];
