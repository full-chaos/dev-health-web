import { useEffect, useId, useMemo } from "react";

import { humanizeTerm } from "@/lib/ask-dev/facts/fact-rows";
import { windowText } from "@/lib/ask-dev/render/window-text";
import { logger } from "@/lib/logger";

import { ANSWER_COPY, FACT_KIND_LABEL, labelFor, type AnswerResult } from "./answerModel";
import {
    claimedFactTables,
    type FactTableCell,
    type FactTableModel,
} from "./claimedFactTablesModel";

/**
 * The claimed-fact tables of an answer (CHAOS-11945, E8 design §11): the rows the service read, as
 * it sent them, one table per cited table. The header gives the answer's evidence window in words,
 * or "Window not stated" (CHAOS-11601); units are only what the served column names say. Each table
 * keeps an empty trend slot naming every claim id of its group: the trend chart (I-24) mounts there.
 * Served strings are inert React text.
 */
function Cell({ cell }: { cell: FactTableCell }) {
    const className = "whitespace-nowrap border-t border-(--card-stroke) px-2 py-1 align-top";
    if (cell.kind === "value") return <td className={className}>{cell.text}</td>;
    return (
        <td
            className={`${className} text-(--ink-muted)`}
            aria-label={
                cell.kind === "null" ? ANSWER_COPY.factCellNull : ANSWER_COPY.factCellAbsent
            }
        >
            —
        </td>
    );
}

function FactTable({ model }: { model: FactTableModel }) {
    const title = `${labelFor(FACT_KIND_LABEL, model.kind)} · ${humanizeTerm(model.tableField)}`;
    const claimIds = model.claimIds.join(" ");
    return (
        <div
            className="space-y-2 rounded-(--radius-sm) border border-(--card-stroke) p-3"
            data-testid="ask-dev-fact-table"
            data-claim-ids={claimIds}
        >
            <div>
                <p className="text-sm font-semibold text-foreground">{title}</p>
                {model.subjectLabel === null ? null : (
                    <p className="text-xs text-(--ink-muted)">
                        {ANSWER_COPY.about}: {model.subjectLabel}
                    </p>
                )}
                {model.alsoFields.length === 0 ? null : (
                    <p className="text-xs text-(--ink-muted)">
                        {ANSWER_COPY.factAlsoCited}:{" "}
                        {model.alsoFields.map((field) => humanizeTerm(field)).join(", ")}
                    </p>
                )}
            </div>
            {/* A wide or long table scrolls inside this box (its header row stays in view); the box
                takes focus so a keyboard can scroll it.
                A group, not a region: an answer may hold several tables of one name, and landmarks
                must be unique (axe landmark-unique; CHAOS-12157 did the same for answer parts). */}
            <div
                className="max-h-72 overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)/50"
                role="group"
                aria-label={title}
                tabIndex={0}
                data-testid="ask-dev-fact-table-scroll"
            >
                <table className="w-full text-left text-xs text-foreground">
                    <caption className="sr-only">{title}</caption>
                    <thead>
                        <tr>
                            {model.columns.map((column) => (
                                <th
                                    key={column.key}
                                    scope="col"
                                    title={column.key}
                                    data-role={column.measure ? "measure" : undefined}
                                    className="sticky top-0 whitespace-nowrap bg-(--surface) px-2 py-1 font-semibold text-(--ink-muted)"
                                >
                                    {humanizeTerm(column.key)}
                                    {column.measure ? ` ${ANSWER_COPY.factMeasureSuffix}` : null}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {model.rows.map((cells, rowIndex) => (
                            <tr key={rowIndex}>
                                {cells.map((cell, cellIndex) => (
                                    <Cell key={model.columns[cellIndex]!.key} cell={cell} />
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div data-testid="ask-dev-fact-trend-slot" data-claim-ids={claimIds} />
        </div>
    );
}

export function ClaimedFactTables({ result }: { result: AnswerResult }) {
    const titleId = useId();
    const facts = result.claimed_facts;
    const models = useMemo(() => claimedFactTables(facts ?? []), [facts]);

    useEffect(() => {
        for (const model of models) {
            if (model.mismatch === null) continue;
            // The claim index and a closed reason only: no column, field, subject or value.
            logger.warn(
                {
                    claim_index: model.mismatch.claimIndex,
                    event: "ask_dev_fact_declaration_mismatch",
                    reason: model.mismatch.reason,
                },
                "Ask Dev fact table declaration does not fit its rows; first-seen column order used",
            );
        }
    }, [models]);

    if (models.length === 0) return null;
    return (
        <div
            role="group"
            aria-labelledby={titleId}
            data-testid="ask-dev-answer-fact-tables"
            className="space-y-2"
        >
            <h3 id={titleId} className="text-sm font-semibold text-foreground">
                {ANSWER_COPY.factTablesTitle}
            </h3>
            <p className="text-xs text-(--ink-muted)" data-testid="ask-dev-fact-tables-window">
                {ANSWER_COPY.factTablesWindow}: {windowText(result)}
            </p>
            <p className="text-xs text-(--ink-muted)">{ANSWER_COPY.factTablesIntro}</p>
            {models.map((model) => (
                <FactTable key={model.claimIds[0]} model={model} />
            ))}
        </div>
    );
}
