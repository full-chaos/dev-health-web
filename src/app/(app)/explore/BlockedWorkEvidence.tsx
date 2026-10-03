import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { NOT_REPORTED } from "@/components/evidence/EvidenceFacts";
import { buttonClassName } from "@/components/shared/Button";
import { Inset } from "@/components/ui/Inset";
import { Section } from "@/components/ui/Section";
import { CTA_LABELS } from "@/lib/design/cta";
import { formatMetricParts } from "@/lib/formatters";

type BlockedWorkEvidenceProps = {
    /** The served metric label ("Blocked Work"). */
    label: string;
    /** The served headline value; undefined when the explain read gave none. */
    value?: number;
    /** The served unit ("hours"). */
    unit?: string;
    /** The window the page reads, in days. */
    rangeDays: number;
    /** Where "Return to investigation" goes (the served origin, else the metric's Flow tab). */
    returnHref: string;
};

/** One row of the evidence table: the surface and its state. No value served = "Not reported". */
function SurfaceRow({ surface, state }: { surface: string; state?: ReactNode }) {
    const reported = state !== undefined && state !== null;
    return (
        <tr data-testid="blocked-evidence-row" data-reported={reported}>
            <td className="border-b border-(--card-stroke) px-3 py-3.25">{surface}</td>
            <td
                className={`border-b border-(--card-stroke) px-3 py-3.25 tabular-nums ${
                    reported ? "text-foreground" : "text-(--ink-muted)"
                }`}
            >
                {reported ? state : NOT_REPORTED}
            </td>
        </tr>
    );
}

/**
 * The Blocked Work evidence section (approved prototype `blockedEvidence()`, app.js line 102):
 * the work-item count, the "Zero is not a substitute for evidence" inset and the evidence table.
 * The list and the count of blocked work items are not served yet (backend ticket CHAOS-8106),
 * so they read "Not reported" and the "Open complete table" action is left out: the served
 * issue drilldown is not limited to blocked items. Every other value is served.
 */
export function BlockedWorkEvidence({
    label,
    value,
    unit,
    rangeDays,
    returnHref,
}: BlockedWorkEvidenceProps) {
    const parts = value !== undefined ? formatMetricParts(value, unit ?? "") : null;
    const headline = parts
        ? `${label} · ${[parts.value, parts.unit].filter(Boolean).join(" ")}`
        : undefined;

    return (
        <Section
            data-testid="blocked-work-evidence"
            title="Blocked Work evidence"
            description="The headline and the work-item evidence behind it, together."
            action={
                <Link
                    href={returnHref}
                    data-testid="explore-return"
                    className={buttonClassName("ghost", "sm")}
                >
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                    {CTA_LABELS.returnToInvestigation}
                </Link>
            }
        >
            <div data-testid="blocked-work-count">
                <h3 className="text-sm font-semibold text-foreground">
                    Captured work items:{" "}
                    <span className="font-normal text-(--ink-muted)">{NOT_REPORTED}</span>
                </h3>
                <p className="mt-1 text-xs text-(--ink-muted)">
                    The list of blocked work items is not served for this window yet.
                </p>
            </div>

            <Inset
                data-testid="blocked-work-inset"
                className="text-xs leading-relaxed text-(--ink-muted)"
            >
                <h4 className="text-sm font-semibold text-foreground">
                    Zero is not a substitute for evidence
                </h4>
                <p className="mt-1.5">
                    A 0-hour headline does not show that no work is blocked: it shows that no
                    blocked time was recorded in this window. Read it with the work items behind it.
                </p>
            </Inset>

            <div className="mt-4 overflow-auto">
                <table data-testid="blocked-work-table" className="w-full text-left text-xs">
                    <thead>
                        <tr>
                            <th className="bg-background px-3 py-2.75 text-label-caps uppercase text-(--ink-muted)">
                                Evidence surface
                            </th>
                            <th className="bg-background px-3 py-2.75 text-label-caps uppercase text-(--ink-muted)">
                                Captured state
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <SurfaceRow surface="Metric headline" state={headline} />
                        <SurfaceRow surface="Result table" />
                        <SurfaceRow surface="Time window" state={`${rangeDays} days`} />
                    </tbody>
                </table>
            </div>
        </Section>
    );
}
