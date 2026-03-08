"use client";

import { useMemo, useState } from "react";
import { SyncJob } from "@/lib/admin/types";
import { SyncStatusBadge } from "./SyncStatusBadge";

interface SyncJobHistoryProps {
  jobs: SyncJob[];
  totalJobs?: number;
}

export function SyncJobHistory({ jobs, totalJobs }: SyncJobHistoryProps) {
  const [offset, setOffset] = useState(0);
  const limit = 10;
  const total = totalJobs ?? jobs.length;
  const paginatedJobs = useMemo(() => jobs.slice(offset, offset + limit), [jobs, offset]);

  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-8 text-center">
        <p className="text-sm text-(--ink-muted)">No sync history available.</p>
      </div>
    );
  }

  const getBadgeStatus = (status: SyncJob["status"]) => {
    switch (status) {
      case "success":
        return "success";
      case "failed":
        return "failed";
      case "running":
        return "running";
      case "pending":
        return "idle";
      default:
        return "never";
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-(--card-stroke) bg-(--card-80)">
      <table className="min-w-full divide-y divide-(--card-stroke)">
        <thead className="bg-(--card-bg)">
          <tr>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-(--ink-muted) uppercase tracking-wider">
              Status
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-(--ink-muted) uppercase tracking-wider">
              Started At
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-(--ink-muted) uppercase tracking-wider">
              Duration
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-(--ink-muted) uppercase tracking-wider">
              Items Synced
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-(--ink-muted) uppercase tracking-wider">
              Error
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-(--card-stroke) bg-(--card-80)">
          {paginatedJobs.map((job) => {
            const duration = job.duration_seconds
              ? `${Math.round(job.duration_seconds)}s`
              : job.completed_at
              ? Math.round((new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000) + "s"
              : "-";

            return (
              <tr key={job.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <SyncStatusBadge status={getBadgeStatus(job.status)} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                  {new Date(job.started_at).toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-(--ink-muted)">
                  {duration}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-(--ink-muted)">
                  {job.items_synced ?? "-"}
                </td>
                <td className="px-6 py-4 text-sm text-red-500">
                  {job.error ? (
                    <span title={job.error} className="line-clamp-2">
                      {job.error}
                    </span>
                  ) : (
                    <span className="text-(--ink-muted)">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="flex items-center justify-between border-t border-(--card-stroke) px-6 py-4">
        <span className="text-sm text-(--ink-muted)">
          Showing {offset + 1}-{Math.min(offset + limit, total)} of {total}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
            disabled={offset === 0}
            className="rounded-lg border border-(--card-stroke) bg-(--card-80) px-4 py-2 text-sm font-medium hover:bg-(--card-70) disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setOffset((prev) => prev + limit)}
            disabled={offset + limit >= total}
            className="rounded-lg border border-(--card-stroke) bg-(--card-80) px-4 py-2 text-sm font-medium hover:bg-(--card-70) disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
