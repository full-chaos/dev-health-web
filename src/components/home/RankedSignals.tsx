"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";

import { NOT_REPORTED } from "@/components/evidence/EvidenceFacts";
import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import { Button } from "@/components/shared/Button";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { Section } from "@/components/ui/Section";
import { isMetricSignal } from "@/lib/cockpit/signalKinds";
import { signalMetricLabel } from "@/lib/cockpit/signalLabel";
import { CTA_LABELS } from "@/lib/design/cta";
import type { MetricFilter } from "@/lib/filters/types";
import { scrubIdentifiers } from "@/lib/labels/entityLabel";
import { noDataText } from "@/lib/metrics/metricDisplay";
import { isRepoLinkNoValueState, repoLinkTileNote } from "@/lib/metrics/repoLinkNote";
import { NOT_FILTERED_BY_REPOSITORY, isRepoUnscopedMetric } from "@/lib/metrics/repoScope";
import type { CockpitSignal, MetricDelta } from "@/lib/types";

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

/** Shown in place of the table when the API served no metric signal after the primary one. */
export const RANKED_SIGNALS_NO_OTHER = "No other metric signals in this window.";
/** Shown in place of the table when the API served no signal at all. */
export const RANKED_SIGNALS_NONE = "No signals in this window.";

/** Rows shown before "Show all signals" (the approved table has five). */
export const RANKED_SIGNALS_FIRST_ROWS = 5;

/**
 * Ranked signals of Home (approved prototype `cockpit()`, `app.js:100`): a table with the columns
 * Signal, Current, Previous and Change, and an "Evidence" action per row.
 *
 * Rows are the headline METRIC signals after the first signal, in the served rank order: the
 * first signal is the primary-signal hero above the table. A metric signal is told by a served
 * field (`isMetricSignal`: its `metric` is one of the served `deltas[].metric`), never by its
 * title. The signals of the other kinds are not rows of this table: the compounding-risk signals
 * are the "Compounding risk" row of the Investigation threads.
 *
 * The table shows the first five rows. When the API served more, one control under the table
 * shows the rest in place (no route change, no row left out).
 *
 * Current, Previous and Change are the served display strings; a missing value reads "Not
 * reported". The Change text carries no good or bad colour.
 *
 * Each row's "Evidence" opens the shared evidence drawer for that signal, with the signal's
 * served "why it matters" and "recommended action" first.
 */
export function RankedSignals({ signals, deltas = [], filters }: RankedSignalsProps) {
    const evidence = useEvidenceDrawer();
    const [showAll, setShowAll] = useState(false);
    const rows = signals.slice(1).filter((signal) => isMetricSignal(signal, deltas));
    const hasMore = rows.length > RANKED_SIGNALS_FIRST_ROWS;
    const shownRows = showAll ? rows : rows.slice(0, RANKED_SIGNALS_FIRST_ROWS);
    const noRowsLine = signals.length === 0 ? RANKED_SIGNALS_NONE : RANKED_SIGNALS_NO_OTHER;

    const linkNoteOf = (signal: CockpitSignal) =>
        repoLinkTileNote(deltas.find((delta) => delta.metric === signal.metric));

    // A row whose metric serves a no-value link state draws no data, never a value (CHAOS-9120).
    const noValueOf = (signal: CockpitSignal) => {
        const delta = deltas.find((d) => d.metric === signal.metric);
        return delta && isRepoLinkNoValueState(delta.repo_link_state) ? delta : null;
    };

    const columns: DataTableColumn<CockpitSignal>[] = [
        {
            key: "signal",
            header: "Signal",
            render: (signal) => (
                <>
                    <span data-testid="signal-label" className="font-medium text-foreground">
                        {scrubIdentifiers(signalMetricLabel(signal, deltas)).text}
                    </span>
                    {isRepoUnscopedMetric(signal.metric, filters, signal) ? (
                        <span
                            data-testid="signal-repo-note"
                            className="block text-xs text-(--ink-muted)"
                        >
                            {NOT_FILTERED_BY_REPOSITORY}
                        </span>
                    ) : null}
                    {/* CHAOS-9120: the link basis or state of a repository-scoped work-item metric. */}
                    {linkNoteOf(signal) ? (
                        <span
                            data-testid="signal-repo-link-note"
                            className="block text-xs text-(--ink-muted)"
                        >
                            {linkNoteOf(signal)}
                        </span>
                    ) : null}
                </>
            ),
        },
        {
            key: "current",
            header: "Current",
            className: "whitespace-nowrap px-3 py-3.25 tabular-nums",
            render: (signal) => (
                <span data-testid="signal-current">
                    {noValueOf(signal) ? noDataText(signal.metric) : signal.current_value}
                </span>
            ),
        },
        {
            key: "previous",
            header: "Previous",
            className: "whitespace-nowrap px-3 py-3.25 tabular-nums",
            render: (signal) => (
                <span data-testid="signal-previous">
                    {!noValueOf(signal) &&
                    signal.prior_value != null &&
                    signal.prior_value !== "" ? (
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
                    {!noValueOf(signal) && signal.delta ? (
                        // The served string carries its own sign (approved table: plain text).
                        signal.delta
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
                    data={shownRows}
                    rowKeyAction={(signal) => signal.id}
                    rowTestId="signal-row"
                    emptyMessage={noRowsLine}
                    footerNote={
                        <>
                            <span>{RANKED_SIGNALS_NOTE}</span>
                            {hasMore ? (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="ml-auto"
                                    data-testid="ranked-signals-toggle"
                                    aria-expanded={showAll}
                                    onClick={() => setShowAll((current) => !current)}
                                >
                                    {showAll
                                        ? CTA_LABELS.showFewerSignals
                                        : `${CTA_LABELS.showAllSignals} (${rows.length})`}
                                </Button>
                            ) : null}
                        </>
                    }
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
