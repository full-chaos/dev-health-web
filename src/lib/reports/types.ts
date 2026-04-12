export enum ReportStatus {
  SUCCESS = "success",
  FAILED = "failed",
  RUNNING = "running",
}

export type ReportRun = {
  id: string;
  reportId: string;
  status: ReportStatus;
  startedAt?: string;
  completedAt?: string;
  durationSeconds?: number;
  renderedMarkdown?: string;
  artifactUrl?: string;
  provenanceRecords?: unknown;
  error?: string;
  triggeredBy: string;
  createdAt: string;
};

export type SavedReport = {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  reportPlan: unknown;
  isTemplate: boolean;
  templateSourceId?: string;
  parameters?: unknown;
  scheduleId?: string;
  isActive: boolean;
  lastRunAt?: string;
  lastRunStatus?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
};

export type CreateSavedReportInput = {
  name: string;
  description?: string;
  reportPlan?: unknown;
  isTemplate?: boolean;
  parameters?: unknown;
  scheduleCron?: string;
  scheduleTimezone?: string;
};
