import { CircleCheck, CircleHelp, OctagonAlert, TriangleAlert } from "lucide-react";

import { STATUS_PILL, type StatusPillTone } from "@/lib/statusPill";

const SEVERITY_PILL: Record<
    string,
    { label: string; tone: StatusPillTone; Icon: typeof CircleCheck }
> = {
    low: { label: "Low", tone: "positive", Icon: CircleCheck },
    moderate: { label: "Moderate", tone: "caution", Icon: TriangleAlert },
    high: { label: "High", tone: "negative", Icon: OctagonAlert },
    critical: { label: "Critical", tone: "negative", Icon: OctagonAlert },
};

/** Not a severity: the telemetry needed to rate it is missing. Its own label and neutral tone. */
const UNAVAILABLE = { label: "Unavailable", tone: "muted", Icon: CircleHelp } as const;

type SeverityPillProps = {
    /** `low | moderate | high | critical`; null or unknown = unavailable. */
    severity: string | null | undefined;
    className?: string;
};

/**
 * Release friction severity as a labelled status pill: icon + word, so the
 * color is never the only signal. "Unavailable" is its own state, never a level.
 */
export function SeverityPill({ severity, className = "" }: SeverityPillProps) {
    const entry = (severity ? SEVERITY_PILL[severity] : undefined) ?? UNAVAILABLE;
    const { label, tone, Icon } = entry;
    return (
        <span
            data-testid="release-friction-severity"
            data-severity={severity && SEVERITY_PILL[severity] ? severity : "unavailable"}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_PILL[tone]} ${className}`}
        >
            <Icon aria-hidden="true" className="h-3 w-3" />
            {label}
        </span>
    );
}
