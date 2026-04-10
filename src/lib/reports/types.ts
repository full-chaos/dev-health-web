export enum ReportStatus {
  SUCCESS = "success",
  FAILED = "failed",
  RUNNING = "running",
}

export type ReportRun = {
  id: string;
  reportId: string;
  status: ReportStatus;
  durationMs: number;
  trigger: "manual" | "scheduled";
  startedAt: string;
  completedAt?: string;
  renderedContent?: string;
  error?: string;
};

export type SavedReport = {
  id: string;
  name: string;
  description: string;
  scope: {
    level: "team" | "repo" | "org";
    id: string;
  };
  dateRange: string;
  metrics: string[];
  schedule: "none" | "weekly" | "monthly";
  createdAt: string;
  updatedAt: string;
  lastRun?: ReportRun;
};
