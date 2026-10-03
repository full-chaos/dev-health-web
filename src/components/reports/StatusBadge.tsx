import type { ReactNode } from "react";
import { CircleCheck, CircleHelp, Clock, Loader, TriangleAlert } from "lucide-react";

import { STATUS_PILL } from "@/lib/statusPill";
import { ReportStatus } from "@/lib/reports/types";

// Pill with an icon and a word (design R15): the word carries the meaning, the icon is decoration.
const PILL = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold";

function Pill({ tone, icon, children }: { tone: string; icon: ReactNode; children: string }) {
    return (
        <span className={`${PILL} ${tone}`}>
            {icon}
            {children}
        </span>
    );
}

export function StatusBadge({ status }: { status?: ReportStatus | string }) {
    if (!status)
        return (
            <span
                className={`${PILL} border border-dashed border-(--card-stroke) text-(--ink-muted)`}
            >
                <CircleHelp aria-hidden="true" className="h-3 w-3" />
                Never run
            </span>
        );

    switch (status) {
        case ReportStatus.SUCCESS:
            return (
                <Pill
                    tone={STATUS_PILL.positive}
                    icon={<CircleCheck aria-hidden="true" className="h-3 w-3" />}
                >
                    Success
                </Pill>
            );
        case ReportStatus.FAILED:
            return (
                <Pill
                    tone={STATUS_PILL.negative}
                    icon={<TriangleAlert aria-hidden="true" className="h-3 w-3" />}
                >
                    Failed
                </Pill>
            );
        case ReportStatus.RUNNING:
            return (
                <Pill
                    tone={STATUS_PILL.info}
                    icon={<Loader aria-hidden="true" className="h-3 w-3" />}
                >
                    Running
                </Pill>
            );
        case ReportStatus.PENDING:
            return (
                <Pill
                    tone={STATUS_PILL.caution}
                    icon={<Clock aria-hidden="true" className="h-3 w-3" />}
                >
                    Pending
                </Pill>
            );
        default:
            return null;
    }
}
