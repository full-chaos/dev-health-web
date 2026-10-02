"use client";

import { ArrowRight } from "lucide-react";

import { NOT_REPORTED } from "@/components/evidence/EvidenceFacts";
import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import { Button } from "@/components/shared/Button";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { Section } from "@/components/ui/Section";
import { signalMetricLabel } from "@/lib/cockpit/signalLabel";
import { CTA_LABELS } from "@/lib/design/cta";
import type { MetricFilter } from "@/lib/filters/types";
import { scrubIdentifiers } from "@/lib/labels/entityLabel";
import type { CockpitSignal, MetricDelta } from "@/lib/types";

import { DIRECTION_GLYPH } from "./severityTokens";
import { SignalEvidenceIntro } from "./SignalEvidenceIntro";

export type RankedSignalsProps = {
    /** Already-ranked signals (top first) from the Home response. */
    signals: CockpitSignal[];
    /** The served metric deltas; their `label` names a signal's metric in the Signal column. */
    deltas?: MetricDelta[];
    /** Active scope and window, sent with the evidence request. */
    filters: MetricFilter;
};

/** Table footer (approved prototype `table(..., foot)`, `app.js:100`, without the capture wording). */
export const RANKED_SIGNALS_NOTE =
    "Headline comparisons. No universal good/bad inference is added.";

/** Shown in place of the table when the API served no signal after the primary one. */
export const RANKED_SIGNALS_NO_OTHER = "No other signals in this window.";
/** Shown in place of the table when the API served no signal at all. */
export const RANKED_SIGNALS_NONE = "No signals in this window.";

/**
 * Ranked signals of Home (approved prototype `cockpit()`, `app.js:100`): a table with the columns
 * Signal, Current, Previous and Change, and an "Evidence" action per row.
 *
 * Rows are the signals AFTER the first one, in the served rank order: the first signal is the
 * primary-signal hero above the table. Current, Previous and Change are the served display
 * strings; a missing value reads "Not reported". The Change text carries no good or bad colour.
 *
 * Each row's "Evidence" opens the shared evidence drawer for that signal, with the signal's
 * served "why it matters" and "recommended action" first.
 */
export function RankedSignals({ signals, deltas = [], filters }: RankedSignalsProps) {
    const evidence = useEvidenceDrawer();
    const rows = signals.slice(1);
    const noRowsLine = signals.length === 0 ? RANKED_SIGNALS_NONE : RANKED_SIGNALS_NO_OTHER;

    const columns: DataTableColumn<CockpitSignal>[] = [
        {
            key: "signal",
            header: "Signal",
            render: (signal) => (
                <span data-testid="signal-label" className="font-medium text-foreground">
                    {scrubIdentifiers(signalMetricLabel(signal, deltas)).text}
                </span>
            ),
        },
        {
            key: "current",
            header: "Current",
            className: "whitespace-nowrap px-3 py-3.25 tabular-nums",
            render: (signal) => <span data-testid="signal-current">{signal.current_value}</span>,
        },
        {
            key: "previous",
            header: "Previous",
            className: "whitespace-nowrap px-3 py-3.25 tabular-nums",
            render: (signal) => (
                <span data-testid="signal-previous">
                    {signal.prior_value != null && signal.prior_value !== "" ? (
                        signal.prior_value
                    ) : (
                        <span className="text-(--ink-muted)">{NOT_REPORTED}</span>
                    )}
                </span>
            ),
        },
        {
            key: "change",
            header: "Change",
            className: "whitespace-nowrap px-3 py-3.25 tabular-nums",
            render: (signal) => (
                <span data-testid="signal-delta" data-direction={signal.direction}>
                    {signal.delta ? (
                        <>
                            <span aria-hidden="true">{DIRECTION_GLYPH[signal.direction]} </span>
                            {signal.delta}
                        </>
                    ) : (
                        <span className="text-(--ink-muted)">{NOT_REPORTED}</span>
                    )}
                </span>
            ),
        },
    ];

    return (
        <Section title="Ranked signals" data-testid="ranked-signals">
            {rows.length === 0 ? (
                <p data-testid="ranked-signals-empty" className="text-sm text-(--ink-muted)">
                    {noRowsLine}
                </p>
            ) : (
                <DataTable
                    accessibleLabel="Ranked signals"
                    columns={columns}
                    data={rows}
                    rowKeyAction={(signal) => signal.id}
                    rowTestId="signal-row"
                    emptyMessage={noRowsLine}
                    footerNote={RANKED_SIGNALS_NOTE}
                    rowActions={(signal) => {
                        const title = scrubIdentifiers(signal.title).text;
                        return (
                            <Button
                                variant="ghost"
                                size="sm"
                                icon={<ArrowRight />}
                                data-testid="signal-open-evidence"
                                // The row's signal is in the name: several rows have this action.
                                aria-label={`${CTA_LABELS.evidence}: ${title}`}
                                onClick={() =>
                                    evidence.open({
                                        title,
                                        apiUrl: signal.evidence_ref || undefined,
                                        metric: signal.metric,
                                        filters,
                                        intro: <SignalEvidenceIntro signal={signal} />,
                                    })
                                }
                            >
                                {CTA_LABELS.evidence}
                            </Button>
                        );
                    }}
                />
            )}
        </Section>
    );
}
