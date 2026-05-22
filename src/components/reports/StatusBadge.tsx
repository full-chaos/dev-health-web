import { ReportStatus } from "@/lib/reports/types";

export function StatusBadge({ status }: { status?: ReportStatus | string }) {
  if (!status)
    return (
      <span className="rounded-full bg-(--card-stroke) px-2 py-0.5 text-[10px] uppercase tracking-wider text-(--ink-muted)">
        Never run
      </span>
    );

  switch (status) {
    case ReportStatus.SUCCESS:
      return (
        <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-green-500">
          Success
        </span>
      );
    case ReportStatus.FAILED:
      return (
        <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-red-500">
          Failed
        </span>
      );
    case ReportStatus.RUNNING:
      return (
        <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-blue-500">
          Running
        </span>
      );
    case ReportStatus.PENDING:
      return (
        <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-yellow-500">
          Pending
        </span>
      );
    default:
      return null;
  }
}
