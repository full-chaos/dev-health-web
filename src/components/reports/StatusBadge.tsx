import { STATUS_PILL } from "@/lib/statusPill";
import { ReportStatus } from "@/lib/reports/types";

export function StatusBadge({ status }: { status?: ReportStatus | string }) {
    if (!status)
        return (
            <span className="rounded-full bg-(--card-stroke) px-2 py-0.5 text-label-caps uppercase tracking-wider text-(--ink-muted)">
                Never run
            </span>
        );

    switch (status) {
        case ReportStatus.SUCCESS:
            return (
                <span
                    className={`rounded-full px-2 py-0.5 text-label-caps uppercase tracking-wider ${STATUS_PILL.positive}`}
                >
                    Success
                </span>
            );
        case ReportStatus.FAILED:
            return (
                <span
                    className={`rounded-full px-2 py-0.5 text-label-caps uppercase tracking-wider ${STATUS_PILL.negative}`}
                >
                    Failed
                </span>
            );
        case ReportStatus.RUNNING:
            return (
                <span
                    className={`rounded-full px-2 py-0.5 text-label-caps uppercase tracking-wider ${STATUS_PILL.info}`}
                >
                    Running
                </span>
            );
        case ReportStatus.PENDING:
            return (
                <span
                    className={`rounded-full px-2 py-0.5 text-label-caps uppercase tracking-wider ${STATUS_PILL.caution}`}
                >
                    Pending
                </span>
            );
        default:
            return null;
    }
}
