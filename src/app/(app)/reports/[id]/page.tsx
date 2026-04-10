"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, use } from "react";

import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { sampleReports, sampleRuns } from "@/lib/reports/sample-data";
import { ReportStatus } from "@/lib/reports/types";

function StatusBadge({ status }: { status?: ReportStatus }) {
  if (!status) return <span className="rounded-full bg-(--card-stroke) px-2 py-0.5 text-[10px] uppercase tracking-wider text-(--ink-muted)">Never run</span>;
  
  switch (status) {
    case ReportStatus.SUCCESS:
      return <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-green-500">Success</span>;
    case ReportStatus.FAILED:
      return <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-red-500">Failed</span>;
    case ReportStatus.RUNNING:
      return <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-blue-500">Running</span>;
    default:
      return null;
  }
}

export default function SingleReportPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";
  
  const report = sampleReports.find((r) => r.id === id);
  const runs = sampleRuns[id] || [];
  
  const [isRunning, setIsRunning] = useState(false);

  if (!report) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
          <PrimaryNav filters={defaultMetricFilter} active="reports" />
          <main className="flex min-w-0 flex-1 flex-col gap-8">
            <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-10 text-center">
              <p className="text-(--ink-muted)">Report not found.</p>
              <Link
                href="/reports"
                className="mt-4 inline-block rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em] hover:bg-(--card-70) transition-colors"
              >
                Back to Reports
              </Link>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const handleRunNow = () => {
    setIsRunning(true);
    setTimeout(() => setIsRunning(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={defaultMetricFilter} active="reports" />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <Link href="/reports" className="text-(--ink-muted) hover:text-foreground transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 18-6-6 6-6"/>
                  </svg>
                </Link>
                <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                  Report Details
                </p>
              </div>
              <h1 className="mt-2 font-(--font-display) text-3xl">
                {report.name}
              </h1>
              <p className="mt-2 text-sm text-(--ink-muted)">
                {report.description}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em] hover:bg-(--card-70) transition-colors"
              >
                Edit
              </button>
              <button
                className="rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em] hover:bg-(--card-70) transition-colors"
              >
                Clone
              </button>
              <button
                onClick={handleRunNow}
                disabled={isRunning}
                className="rounded-full bg-(--accent) px-4 py-2 text-xs uppercase tracking-[0.2em] text-white hover:bg-(--accent-hover) transition-colors disabled:opacity-50"
              >
                {isRunning ? "Running..." : "Run Now"}
              </button>
            </div>
          </header>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5">
                <h2 className="font-(--font-display) text-xl mb-4">Latest Rendered Report</h2>
                {report.lastRun?.renderedContent ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <div className="whitespace-pre-wrap font-mono text-sm text-(--ink-muted)">
                      {report.lastRun.renderedContent}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-(--ink-muted)">No rendered content available for this report.</p>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5">
                <h2 className="font-(--font-display) text-xl mb-4">Configuration</h2>
                <dl className="space-y-4 text-sm">
                  <div>
                    <dt className="text-(--ink-muted) text-xs uppercase tracking-wider">Scope</dt>
                    <dd className="mt-1 font-medium">{report.scope.level}: {report.scope.id}</dd>
                  </div>
                  <div>
                    <dt className="text-(--ink-muted) text-xs uppercase tracking-wider">Date Range</dt>
                    <dd className="mt-1 font-medium">{report.dateRange}</dd>
                  </div>
                  <div>
                    <dt className="text-(--ink-muted) text-xs uppercase tracking-wider">Schedule</dt>
                    <dd className="mt-1 font-medium capitalize">{report.schedule}</dd>
                  </div>
                  <div>
                    <dt className="text-(--ink-muted) text-xs uppercase tracking-wider">Metrics</dt>
                    <dd className="mt-1 font-medium">
                      <div className="flex flex-wrap gap-2">
                        {report.metrics.map(m => (
                          <span key={m} className="rounded-md bg-(--card-70) px-2 py-1 text-xs">{m}</span>
                        ))}
                      </div>
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5">
                <h2 className="font-(--font-display) text-xl mb-4">Run History</h2>
                {runs.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-(--card-stroke) text-(--ink-muted)">
                          <th className="pb-2 font-medium">Date</th>
                          <th className="pb-2 font-medium">Status</th>
                          <th className="pb-2 font-medium">Duration</th>
                          <th className="pb-2 font-medium">Trigger</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-(--card-stroke)">
                        {runs.map((run) => (
                          <tr key={run.id} className="hover:bg-(--card-70) transition-colors">
                            <td className="py-3">{new Date(run.startedAt).toLocaleDateString()}</td>
                            <td className="py-3"><StatusBadge status={run.status} /></td>
                            <td className="py-3">{run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : "-"}</td>
                            <td className="py-3 capitalize">{run.trigger}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-(--ink-muted)">No run history available.</p>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
