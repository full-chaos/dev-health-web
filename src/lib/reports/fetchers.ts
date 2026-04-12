import { graphqlFetch } from "@/lib/graphql/urqlClient";
import { SavedReport, ReportRun, CreateSavedReportInput } from "./types";
import { sampleReports, sampleRuns } from "./sample-data";
import {
  SAVED_REPORTS_QUERY,
  SAVED_REPORT_QUERY,
  REPORT_RUNS_QUERY,
  CREATE_REPORT_MUTATION,
  TRIGGER_REPORT_MUTATION,
} from "./queries";

export async function fetchSavedReports(
  orgId: string,
  limit?: number,
  offset?: number,
  isTestMode: boolean = false
): Promise<{ items: SavedReport[]; total: number }> {
  if (isTestMode) {
    return { items: sampleReports, total: sampleReports.length };
  }

  try {
    const res = await graphqlFetch<{ savedReports: { items: SavedReport[]; total: number } }>(
      SAVED_REPORTS_QUERY,
      { orgId, limit, offset }
    );
    return res.savedReports;
  } catch (error) {
    console.error("Failed to fetch saved reports:", error);
    return { items: [], total: 0 };
  }
}

export async function fetchSavedReport(
  orgId: string,
  reportId: string,
  isTestMode: boolean = false
): Promise<SavedReport | null> {
  if (isTestMode) {
    return sampleReports.find((r) => r.id === reportId) || null;
  }

  try {
    const res = await graphqlFetch<{ savedReport: SavedReport }>(
      SAVED_REPORT_QUERY,
      { orgId, reportId }
    );
    return res.savedReport;
  } catch (error) {
    console.error("Failed to fetch saved report:", error);
    return null;
  }
}

export async function fetchReportRuns(
  orgId: string,
  reportId: string,
  limit?: number,
  isTestMode: boolean = false
): Promise<{ items: ReportRun[]; total: number }> {
  if (isTestMode) {
    const runs = sampleRuns[reportId] || [];
    return { items: runs, total: runs.length };
  }

  try {
    const res = await graphqlFetch<{ reportRuns: { items: ReportRun[]; total: number } }>(
      REPORT_RUNS_QUERY,
      { orgId, reportId, limit }
    );
    return res.reportRuns;
  } catch (error) {
    console.error("Failed to fetch report runs:", error);
    return { items: [], total: 0 };
  }
}

export async function createSavedReport(
  orgId: string,
  input: CreateSavedReportInput
): Promise<SavedReport> {
  const res = await graphqlFetch<{ createSavedReport: SavedReport }>(
    CREATE_REPORT_MUTATION,
    { orgId, input }
  );
  return res.createSavedReport;
}

export async function triggerReport(
  orgId: string,
  reportId: string
): Promise<ReportRun> {
  const res = await graphqlFetch<{ triggerReport: ReportRun }>(
    TRIGGER_REPORT_MUTATION,
    { orgId, reportId }
  );
  return res.triggerReport;
}
