export enum ReportStatus {
  PENDING = "pending",
  RUNNING = "running",
  SUCCESS = "success",
  FAILED = "failed",
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

export type UpdateSavedReportInput = {
  name?: string;
  description?: string;
  reportPlan?: unknown;
  isTemplate?: boolean;
  parameters?: unknown;
  isActive?: boolean;
  scheduleCron?: string;
  scheduleTimezone?: string;
};

export type CloneSavedReportInput = {
  sourceReportId: string;
  newName?: string;
  parameterOverrides?: unknown;
};
