"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import { Button, buttonClassName } from "@/components/shared/Button";
import { Section } from "@/components/ui/Section";
import { CTA_LABELS } from "@/lib/design/cta";
import type { MetricFilter } from "@/lib/filters/types";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { scrubIdentifiers } from "@/lib/labels/entityLabel";
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

/** Section description (approved prototype text, without the words about its static capture). */
export const THREADS_DESCRIPTION =
    "Compact reading order; the long-form sections remain one click away.";

/**
 * "Investigation threads" block of Home (approved prototype `.worklist`, `app.js:100`): four flat
 * rows, each with one "Inspect" action.
 *
 * - Key shifts: the evidence page for the page's scope and window.
 * - Investment mix: the Investment view.
 * - Compounding risk: the Compounding Risk view. Home has no served number for this row, so the
 *   row shows none.
 * - Recent events & limiting factors: opens the shared evidence drawer with the long-form
 *   sections (`HomeLongForm`): Notable shifts, Investigation threads, Limiting factor, Recent
 *   events. Its line is the served limiting-factor claim.
 */
export function InvestigationThreads({ home, filters, activeRole }: InvestigationThreadsProps) {
    const evidence = useEvidenceDrawer();

    const limitingClaim =
        home?.limiting_factor?.claim ??
        home?.constraint.claim ??
        "Evidence will appear once data is ingested.";

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
            // The destination's own description (navigation areas). No number: none is served here.
            summary: "Compounding risk signals.",
            href: withFilterParam("/risk/compounding", filters, activeRole),
        },
    ];

    const row = "flex items-center justify-between gap-4 px-4.75 py-4.5";
    const heading = "text-[0.8125rem] font-semibold text-foreground";
    const line = "mt-1 text-xs text-(--ink-muted)";

    return (
        <Section
            title="Investigation threads"
            description={THREADS_DESCRIPTION}
            data-testid="investigation-threads"
        >
            <div className="divide-y divide-(--card-stroke) overflow-hidden rounded-(--radius-md) border border-(--card-stroke)">
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
