import { ReportStatus, type SavedReport, type ReportRun } from "./types";

export const sampleRuns: Record<string, ReportRun[]> = {
  "report-1": [
    {
      id: "run-1-1",
      reportId: "report-1",
      status: ReportStatus.SUCCESS,
      durationMs: 45000,
      trigger: "scheduled",
      startedAt: "2026-04-09T08:00:00Z",
      completedAt: "2026-04-09T08:00:45Z",
      renderedContent: "# Weekly Engineering Health\n\n## Summary\nEverything looks good this week. DORA metrics are stable.\n\n## Metrics\n- Deployment Frequency: 4.2/day\n- Lead Time for Changes: 1.2 days\n- Change Failure Rate: 2.1%\n- Time to Restore Service: 1.5 hours",
    },
    {
      id: "run-1-2",
      reportId: "report-1",
      status: ReportStatus.SUCCESS,
      durationMs: 42000,
      trigger: "scheduled",
      startedAt: "2026-04-02T08:00:00Z",
      completedAt: "2026-04-02T08:00:42Z",
    },
  ],
  "report-2": [
    {
      id: "run-2-1",
      reportId: "report-2",
      status: ReportStatus.FAILED,
      durationMs: 12000,
      trigger: "manual",
      startedAt: "2026-04-10T10:15:00Z",
      completedAt: "2026-04-10T10:15:12Z",
      error: "Failed to fetch data from GitHub API: Rate limit exceeded",
    },
  ],
  "report-3": [
    {
      id: "run-3-1",
      reportId: "report-3",
      status: ReportStatus.RUNNING,
      durationMs: 15000,
      trigger: "manual",
      startedAt: new Date().toISOString(),
    },
  ],
};

export const sampleReports: SavedReport[] = [
  {
    id: "report-1",
    name: "Weekly Engineering Health",
    description: "Overview of DORA metrics and team health indicators for the past week.",
    scope: {
      level: "org",
      id: "org-1",
    },
    dateRange: "last_7_days",
    metrics: ["deployment_frequency", "lead_time", "change_failure_rate", "time_to_restore"],
    schedule: "weekly",
    createdAt: "2026-03-01T12:00:00Z",
    updatedAt: "2026-04-01T12:00:00Z",
    lastRun: sampleRuns["report-1"][0],
  },
  {
    id: "report-2",
    name: "Frontend Team Quality",
    description: "Deep dive into test coverage, CI success rates, and bug reports for the frontend team.",
    scope: {
      level: "team",
      id: "team-frontend",
    },
    dateRange: "last_30_days",
    metrics: ["test_coverage", "ci_success_rate", "bug_count"],
    schedule: "monthly",
    createdAt: "2026-03-15T09:30:00Z",
    updatedAt: "2026-03-15T09:30:00Z",
    lastRun: sampleRuns["report-2"][0],
  },
  {
    id: "report-3",
    name: "Backend API Performance",
    description: "Latency and error rate analysis for core API services.",
    scope: {
      level: "repo",
      id: "repo-backend",
    },
    dateRange: "last_24_hours",
    metrics: ["p95_latency", "error_rate", "throughput"],
    schedule: "none",
    createdAt: "2026-04-05T14:20:00Z",
    updatedAt: "2026-04-08T11:10:00Z",
    lastRun: sampleRuns["report-3"][0],
  },
];
