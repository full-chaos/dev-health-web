export enum ReportStatus {
  SUCCESS = "success",
  FAILED = "failed",
  RUNNING = "running",
}

export type ReportRun = {
  id: string;
  reportId: string;
  status: ReportStatus;
  startedAt: string;
  completedAt?: string;
  error?: string;
  resultUrl?: string;
  durationMs?: number;
  trigger?: "manual" | "scheduled";
  renderedContent?: string;
};

export type SavedReport = {
  id: string;
  name: string;
  description: string;
  isTemplate?: boolean;
  isActive?: boolean;
  lastRunAt?: string;
  lastRunStatus?: ReportStatus;
  createdAt: string;
  updatedAt: string;
  scope?: {
    level: "team" | "repo" | "org";
    id: string;
  };
  dateRange?: string;
  metrics?: string[];
  schedule?: "none" | "weekly" | "monthly";
  lastRun?: ReportRun;
};
