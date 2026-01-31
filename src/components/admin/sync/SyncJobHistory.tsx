import { SyncJob } from "@/lib/sync-types";
import { SyncStatusBadge } from "./SyncStatusBadge";

interface SyncJobHistoryProps {
  jobs: SyncJob[];
}

export function SyncJobHistory({ jobs }: SyncJobHistoryProps) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-8 text-center">
        <p className="text-sm text-(--ink-muted)">No sync history available.</p>
      </div>
    );
  }

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
              Errors
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-(--card-stroke) bg-(--card-80)">
          {jobs.map((job) => {
            const duration = job.completed_at
              ? Math.round((new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000) + "s"
              : "-";

            return (
              <tr key={job.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <SyncStatusBadge status={job.status} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                  {new Date(job.started_at).toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-(--ink-muted)">
                  {duration}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-(--ink-muted)">
                  {job.items_synced}
                </td>
                <td className="px-6 py-4 text-sm text-red-500">
                  {job.errors.length > 0 ? (
                    <ul className="list-disc pl-4">
                      {job.errors.map((error, i) => (
                        <li key={i}>{error}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-(--ink-muted)">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
