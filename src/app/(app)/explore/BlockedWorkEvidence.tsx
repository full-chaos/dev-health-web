import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { NOT_REPORTED } from "@/components/evidence/EvidenceFacts";
import { buttonClassName } from "@/components/shared/Button";
import { Inset } from "@/components/ui/Inset";
import { Section } from "@/components/ui/Section";
import { CTA_LABELS } from "@/lib/design/cta";
import { formatMetricParts, formatNumber } from "@/lib/formatters";
import type { BlockedWorkIssuesResponse } from "@/lib/types";

/** Shown when the API serves no team name; the team key stays in the cell tooltip only. */
const UNRESOLVED_TEAM = "Unresolved";

type BlockedWorkEvidenceProps = {
    /** The served metric label ("Blocked Work"). */
    label: string;
    /** The served headline value; undefined when the explain read gave none. */
    value?: number;
    /** The served unit ("hours"). */
    unit?: string;
    /** The window the page reads, in days. */
    rangeDays: number;
    /** The endpoint-specific blocked-item result; null means it was not served. */
    blockedIssues: BlockedWorkIssuesResponse | null;
    /** A marked link to a bounded complete table, when this response has all items. */
    completeTableHref?: string;
    /** Where "Return to investigation" goes (the served origin, else the metric's Flow tab). */
    returnHref: string;
};

type BlockedWorkItemsTableProps = {
    blockedIssues: BlockedWorkIssuesResponse | null;
    tableTestId?: string;
};

const itemLabel = (count: number) => `${formatNumber(count)} ${count === 1 ? "item" : "items"}`;

/**
 * The API serves item identity only. Keep this table separate from generic
 * drilldown rendering so a missing title, URL, or duration is never invented.
 */
export function BlockedWorkItemsTable({
    blockedIssues,
    tableTestId = "blocked-work-table",
}: BlockedWorkItemsTableProps) {
    if (!blockedIssues) {
        return (
            <p
                data-testid="blocked-work-items-unavailable"
                className="mt-4 text-sm text-(--ink-muted)"
            >
                Blocked work items were not reported for this window.
            </p>
        );
    }

    if (!blockedIssues.items.length) {
        return (
            <p data-testid="blocked-work-items-empty" className="mt-4 text-sm text-(--ink-muted)">
                No blocked work items were served for this window.
            </p>
        );
    }

    return (
        <div className="mt-4 overflow-auto">
            <table data-testid={tableTestId} className="w-full text-left text-xs">
                <thead>
                    <tr>
                        <th className="bg-background px-3 py-2.75 text-label-caps uppercase text-(--ink-muted)">
                            Work item
                        </th>
                        <th className="bg-background px-3 py-2.75 text-label-caps uppercase text-(--ink-muted)">
                            Provider
                        </th>
                        <th className="bg-background px-3 py-2.75 text-label-caps uppercase text-(--ink-muted)">
                            Status
                        </th>
                        <th className="bg-background px-3 py-2.75 text-label-caps uppercase text-(--ink-muted)">
                            Team
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {blockedIssues.items.map((item) => (
                        <tr
                            key={`${item.provider}:${item.work_item_id}`}
                            data-testid="blocked-work-item"
                        >
                            <td className="border-b border-(--card-stroke) px-3 py-3.25 font-medium">
                                {item.work_item_id}
                            </td>
                            <td className="border-b border-(--card-stroke) px-3 py-3.25">
                                {item.provider}
                            </td>
                            <td className="border-b border-(--card-stroke) px-3 py-3.25">
                                {item.status}
                            </td>
                            <td
                                className="border-b border-(--card-stroke) px-3 py-3.25"
                                title={item.team_id ?? undefined}
                            >
                                {item.team_name || UNRESOLVED_TEAM}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/**
 * The Blocked Work evidence section (approved prototype `blockedEvidence()`, app.js line 102):
 * it combines the served metric headline with the endpoint-specific item list and count.
 */
export function BlockedWorkEvidence({
    label,
    value,
    unit,
    rangeDays,
    blockedIssues,
    completeTableHref,
    returnHref,
}: BlockedWorkEvidenceProps) {
    const parts = value !== undefined ? formatMetricParts(value, unit ?? "") : null;
    const headline = parts
        ? `${label} · ${[parts.value, parts.unit].filter(Boolean).join(" ")}`
        : NOT_REPORTED;
    const shownCount = blockedIssues?.items.length ?? 0;
    const hasCompleteBoundedResult =
        blockedIssues !== null && blockedIssues.count > 0 && blockedIssues.count === shownCount;

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
                    <span className="font-normal text-(--ink-muted)">
                        {blockedIssues ? itemLabel(blockedIssues.count) : NOT_REPORTED}
                    </span>
                </h3>
                {blockedIssues && blockedIssues.count > shownCount ? (
                    <p className="mt-1 text-xs text-(--ink-muted)">
                        The service returned the first {itemLabel(shownCount)} of{" "}
                        {itemLabel(blockedIssues.count)}. It does not serve another page.
                    </p>
                ) : blockedIssues ? (
                    <p className="mt-1 text-xs text-(--ink-muted)">
                        {blockedIssues.count === 0
                            ? "No blocked work items were served for this window."
                            : `All ${itemLabel(blockedIssues.count)} are shown.`}
                    </p>
                ) : (
                    <p className="mt-1 text-xs text-(--ink-muted)">
                        The blocked work-item list was not served for this window.
                    </p>
                )}
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

            <div data-testid="blocked-work-headline" className="mt-4 text-xs text-(--ink-muted)">
                Metric headline: <span className="text-foreground">{headline}</span>
            </div>
            <p data-testid="blocked-work-window" className="mt-1 text-xs text-(--ink-muted)">
                Window: {rangeDays} days
            </p>
            <BlockedWorkItemsTable blockedIssues={blockedIssues} />

            {hasCompleteBoundedResult && completeTableHref ? (
                <Link
                    href={completeTableHref}
                    data-testid="blocked-work-complete-table"
                    className={`${buttonClassName("secondary", "sm")} mt-4`}
                >
                    {CTA_LABELS.openCompleteTable}
                </Link>
            ) : null}
        </Section>
    );
}
