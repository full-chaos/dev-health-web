"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import { Button, buttonClassName } from "@/components/shared/Button";
import { Section } from "@/components/ui/Section";
import { riskSignalsLine } from "@/lib/cockpit/riskLine";
import { CTA_LABELS } from "@/lib/design/cta";
import type { MetricFilter } from "@/lib/filters/types";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { scrubIdentifiers } from "@/lib/labels/entityLabel";
import { READ_FAILED_MESSAGE } from "@/lib/readFailure";
import type { HomeResponse } from "@/lib/types";

import { HomeLongForm } from "./HomeLongForm";

type InvestigationThreadsProps = {
    home: HomeResponse | null;
    filters: MetricFilter;
    /** The lens role, kept on every link. */
    activeRole: string;
};

/** Title of the fourth row, and of the drawer it opens. */
export const LONG_FORM_TITLE = "Recent events & limiting factors";

/** Line of the "Compounding risk" row when the API served no risk signal. */
export const COMPOUNDING_RISK_PLAIN_LINE = "Compounding risk signals.";

/** Section description (approved prototype text, without the words about its static capture). */
export const THREADS_DESCRIPTION =
    "Compact reading order; the long-form sections remain one click away.";

/**
 * "Investigation threads" block of Home (approved prototype `.worklist`, `app.js:100`): four flat
 * rows, each with one "Inspect" action.
 *
 * - Key shifts: the evidence page for the page's scope and window.
 * - Investment mix: the Investment view.
 * - Compounding risk: the Compounding Risk view. Its line names the served risk signals (their
 *   served values and served confidence words, `riskSignalsLine`); with no served risk signal
 *   the row keeps its plain line and shows no number.
 * - Recent events & limiting factors: opens the shared evidence drawer with the long-form
 *   sections (`HomeLongForm`): Notable shifts, Investigation threads, Limiting factor, Recent
 *   events. Its line is the served limiting-factor claim.
 */
export function InvestigationThreads({ home, filters, activeRole }: InvestigationThreadsProps) {
    const evidence = useEvidenceDrawer();

    // A FAILED Home read (`null`) says so; "will appear once data is ingested" needs an answer.
    const limitingClaim =
        home === null
            ? READ_FAILED_MESSAGE
            : (home.limiting_factor?.claim ??
              home.constraint?.claim ??
              "Evidence will appear once data is ingested.");

    const linkRows = [
        {
            id: "key-shifts",
            title: "Key shifts",
            summary: "Open the ranked signal evidence before selecting an intervention.",
            href: buildExploreUrl({ filters, role: activeRole }),
        },
        {
            id: "investment-mix",
            title: "Investment mix",
            summary: "Follow allocation to the underlying work-unit evidence.",
            href: withFilterParam("/investment", filters, activeRole),
        },
        {
            id: "compounding-risk",
            title: "Compounding risk",
            // The served risk signals as text. With none served: the destination's own
            // description (navigation areas), and no number.
            summary:
                home === null
                    ? READ_FAILED_MESSAGE
                    : (riskSignalsLine(home.signals) ?? COMPOUNDING_RISK_PLAIN_LINE),
            href: withFilterParam("/risk/compounding", filters, activeRole),
        },
    ];

    const row = "flex items-center justify-between gap-4 px-4.75 py-4.5";
    const heading = "text-sm font-semibold text-foreground";
    const line = "mt-1 text-xs text-(--ink-muted)";

    return (
        <Section
            title="Investigation threads"
            description={THREADS_DESCRIPTION}
            data-testid="investigation-threads"
        >
            <div className="divide-y divide-(--card-stroke)">
                {linkRows.map((item) => (
                    <div key={item.id} data-testid={`thread-row-${item.id}`} className={row}>
                        <div className="min-w-0">
                            <h3 className={heading}>{item.title}</h3>
                            <p className={line}>{item.summary}</p>
                        </div>
                        <Link
                            href={item.href}
                            // The row is in the name: four rows have this action.
                            aria-label={`${CTA_LABELS.inspect}: ${item.title}`}
                            className={buttonClassName("ghost", "sm", "shrink-0")}
                        >
                            <ArrowRight aria-hidden="true" className="h-4 w-4" />
                            {CTA_LABELS.inspect}
                        </Link>
                    </div>
                ))}
                <div data-testid="thread-row-recent-events" className={row}>
                    <div className="min-w-0">
                        <h3 className={heading}>{LONG_FORM_TITLE}</h3>
                        <p className={line}>{scrubIdentifiers(limitingClaim).text}</p>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        icon={<ArrowRight />}
                        aria-label={`${CTA_LABELS.inspect}: ${LONG_FORM_TITLE}`}
                        onClick={() =>
                            evidence.open({
                                title: LONG_FORM_TITLE,
                                content: (
                                    <HomeLongForm
                                        home={home}
                                        filters={filters}
                                        activeRole={activeRole}
                                    />
                                ),
                            })
                        }
                    >
                        {CTA_LABELS.inspect}
                    </Button>
                </div>
            </div>
        </Section>
    );
}
