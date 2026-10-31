"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useReducer,
    useRef,
    type ReactNode,
} from "react";

import { chartColors } from "@/components/charts/chartTheme";
import { logger } from "@/lib/logger";
import type { InvestigationResult } from "@/lib/ask-dev/render/contracts";
import { OccurrenceLedger } from "@/lib/ask-dev/render/placement";
import {
    noticeOwnerFor,
    planRenderShapes,
    RANKING_GATE_REASONS,
    type NoticeOwner,
    type PlanInput,
    type PlannedShape,
} from "@/lib/ask-dev/render/shape-plan";
import { windowText } from "@/lib/ask-dev/render/window-text";
import {
    loggableResultId,
    logWithheld,
    type WithheldReason,
} from "@/lib/ask-dev/render/withheld-log";

import { CHART_READY_TIMEOUT_MS } from "./AskDevEChart";
import { RenderShapeFigure, type FigureSettle } from "./RenderShapeFigure";
import { WithheldNotice } from "./WithheldNotice";

/**
 * The answer's render-shape ledger (CHAOS-11942, E8 design §4.1, G4). One provider per answer: it
 * plans every served occurrence (`planRenderShapes`), records each in an `OccurrenceLedger`, lets
 * the mounted figures settle theirs, and checks the ledger when nothing is PENDING and again at the
 * bound. A violation withholds every chart of the answer behind one notice and logs
 * `ask_dev_render_accounting_violated`. Each WITHHELD occurrence is logged once
 * (`ask_dev_render_withheld`, ids and closed words only); a timeout also logs
 * `ask_dev_chart_ready_timeout` with the elapsed time, because a timeout is a fallback.
 */
export type RenderShapesInput = PlanInput &
    Pick<InvestigationResult, "effective_evidence_window"> & {
        readonly result_id?: string;
        readonly request_id?: string;
    };

/** After every figure's own timer, so a PENDING entry at this point never mounted (G4). */
export const RENDER_BOUND_MS = CHART_READY_TIMEOUT_MS + 2000;

type Context = {
    readonly planned: readonly PlannedShape[];
    readonly ledger: OccurrenceLedger;
    readonly violated: boolean;
    readonly settle: FigureSettle;
    readonly result: RenderShapesInput;
};

const RenderShapesContext = createContext<Context | null>(null);

type State = { readonly version: number; readonly violatedLedger: OccurrenceLedger | null };
type Action =
    { readonly type: "settled" } | { readonly type: "violated"; readonly ledger: OccurrenceLedger };

function reduce(state: State, action: Action): State {
    return action.type === "settled"
        ? { ...state, version: state.version + 1 }
        : { version: state.version + 1, violatedLedger: action.ledger };
}

export function RenderShapesProvider({
    result,
    groups,
    children,
}: {
    readonly result: RenderShapesInput;
    /** Claim ids of each rendered fact-table group, or `null` when no analysis part renders. */
    readonly groups: readonly (readonly string[])[] | null;
    readonly children: ReactNode;
}) {
    // Planned again only when a field the plan reads changes, not when the answer object is
    // copied (codex r1c on #1629: a refreshed answer object made a new ledger that no chart settled).
    const { render_shapes: shapes, cohort, claimed_facts: facts, interpretation } = result;
    const { planned, ledger } = useMemo(() => {
        const input = { render_shapes: shapes, cohort, claimed_facts: facts, interpretation };
        const plan = planRenderShapes(input, { groups, paletteSize: chartColors.length });
        const book = new OccurrenceLedger(shapes?.length ?? 0);
        for (const entry of plan) book.record(entry.index, entry.initial);
        return { planned: plan, ledger: book };
    }, [shapes, cohort, facts, interpretation, groups]);
    const [state, dispatch] = useReducer(reduce, { version: 0, violatedLedger: null });
    const violated = state.violatedLedger === ledger;
    const ids = useMemo(
        () => ({ resultId: result.result_id ?? "", requestId: result.request_id ?? "" }),
        [result.result_id, result.request_id],
    );
    const logged = useRef(new WeakSet<OccurrenceLedger>());
    // A violation is reported once per ledger: `check` runs again on every later render, and a
    // ledger with no PENDING entry would otherwise report (and re-render) forever.
    const reported = useRef(new WeakSet<OccurrenceLedger>());

    useEffect(() => {
        if (logged.current.has(ledger)) return;
        logged.current.add(ledger);
        for (const entry of planned) {
            if (entry.initial.kind === "WITHHELD")
                logWithheld(ids, entry.index, entry.shape, entry.initial.reason);
            const mismatch = entry.caption?.mismatch;
            if (mismatch) {
                // E8 §7.4: the shape cites other members than ACR's selection expects. Counts only.
                logger.warn(
                    {
                        event: "ask_dev_cohort_coverage_mismatch",
                        result_id: loggableResultId(ids.resultId),
                        shape_index: entry.index,
                        ranked: mismatch.ranked,
                        scored: mismatch.scored,
                        expected: mismatch.expected,
                        cited: mismatch.cited,
                    },
                    "ask dev cohort chart coverage does not match the ranking",
                );
            }
        }
    }, [planned, ledger, ids]);

    const settle = useCallback<FigureSettle>(
        (index, outcome, elapsedMs) => {
            // First settlement wins; a figure that fails after it drew is withdrawn, once.
            const applied =
                ledger.settle(index, outcome) ||
                (outcome.kind === "WITHHELD" && ledger.withdraw(index, outcome));
            if (!applied) return;
            if (outcome.kind === "WITHHELD") {
                const entry = planned.find((candidate) => candidate.index === index);
                if (outcome.reason === "render_timeout") {
                    logger.error(
                        {
                            event: "ask_dev_chart_ready_timeout",
                            result_id: loggableResultId(ids.resultId),
                            shape_index: index,
                            elapsed_ms: elapsedMs ?? null,
                        },
                        "ask dev chart did not report finished before the timeout",
                    );
                }
                if (entry !== undefined) logWithheld(ids, index, entry.shape, outcome.reason);
            }
            dispatch({ type: "settled" });
        },
        [ledger, planned, ids],
    );

    const check = useCallback(() => {
        if (reported.current.has(ledger)) return;
        const violations = ledger.violations(true);
        if (violations.length === 0) return;
        reported.current.add(ledger);
        const count = (kind: (typeof violations)[number]["kind"]) =>
            violations.filter((violation) => violation.kind === kind).length;
        // Counts per closed violation kind only: no index list, label or value.
        logger.error(
            {
                event: "ask_dev_render_accounting_violated",
                result_id: loggableResultId(ids.resultId),
                shapes: ledger.size,
                missing_outcome: count("missing_outcome"),
                duplicate_outcome: count("duplicate_outcome"),
                unknown_index: count("unknown_index"),
                pending_after_bound: count("pending_after_bound"),
            },
            "ask dev render ledger did not account for every served shape",
        );
        // Every chart of the answer is now withheld; each one not already logged is logged once.
        for (const entry of planned) {
            if (ledger.outcome(entry.index)?.kind !== "WITHHELD")
                logWithheld(ids, entry.index, entry.shape, "render_accounting_violated");
        }
        dispatch({ type: "violated", ledger });
    }, [ledger, planned, ids]);

    const pending = planned.some((entry) => ledger.outcome(entry.index)?.kind === "PENDING");
    useEffect(() => {
        if (!pending) check();
    }, [pending, check, state.version]);
    useEffect(() => {
        const timer = setTimeout(check, RENDER_BOUND_MS);
        return () => clearTimeout(timer);
    }, [check]);

    const value = useMemo(
        () => ({ planned, ledger, violated, settle, result }),
        // `state.version` re-renders consumers after each settlement.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [planned, ledger, violated, settle, result, state.version],
    );
    return <RenderShapesContext.Provider value={value}>{children}</RenderShapesContext.Provider>;
}

const sameOwner = (a: NoticeOwner, b: NoticeOwner): boolean =>
    a.kind === b.kind && (a.kind !== "group" || (b.kind === "group" && a.key === b.key));

/** The withheld reasons `owner` must state, one per occurrence. */
function ownedReasons(context: Context, owner: NoticeOwner): WithheldReason[] {
    if (context.violated)
        return owner.kind === "answer"
            ? context.planned.map(() => "render_accounting_violated" as const)
            : [];
    const reasons: WithheldReason[] = [];
    for (const entry of context.planned) {
        const outcome = context.ledger.outcome(entry.index);
        if (outcome?.kind !== "WITHHELD") continue;
        if (sameOwner(noticeOwnerFor(entry, outcome.reason), owner)) reasons.push(outcome.reason);
    }
    return reasons;
}

/** The figures of the occurrences `belongs` selects that are PENDING or DRAWN, in served order. */
function PlacedFigures({
    context,
    belongs,
}: {
    readonly context: Context;
    readonly belongs: (entry: PlannedShape) => boolean;
}) {
    if (context.violated) return null;
    return (
        <>
            {context.planned.filter(belongs).map((entry) => {
                const outcome = context.ledger.outcome(entry.index);
                if (outcome?.kind !== "PENDING" && outcome?.kind !== "DRAWN") return null;
                return (
                    <RenderShapeFigure
                        // A new ledger remounts its figures: each ledger gets its own chart attempt.
                        key={`${context.ledger.id}:${entry.index}`}
                        index={entry.index}
                        shape={entry.shape}
                        cohort={context.result.cohort}
                        windowText={windowText(context.result)}
                        drawn={outcome.kind === "DRAWN"}
                        onSettle={context.settle}
                        caption={entry.caption?.sentences}
                    />
                );
            })}
        </>
    );
}

/**
 * The trends of one fact-table group, in served order, and the notice for its own withheld trends
 * (CHAOS-11942, E8 design §4.3). `claimIds` are all the claims folded into the group; the plan
 * keys a group by its first one. Outside a provider it renders the empty slot.
 */
export function FactTrendSlot({ claimIds }: { readonly claimIds: readonly string[] }) {
    const context = useContext(RenderShapesContext);
    const key = claimIds[0];
    return (
        <div
            data-testid="ask-dev-fact-trend-slot"
            data-claim-ids={claimIds.join(" ")}
            className="space-y-3"
        >
            {context === null || key === undefined ? null : (
                <>
                    <PlacedFigures context={context} belongs={(entry) => entry.group === key} />
                    <WithheldNotice
                        reasons={ownedReasons(context, { kind: "group", key })}
                        testId="ask-dev-fact-trend-withheld"
                    />
                </>
            )}
        </div>
    );
}

/** The answer-level notice: every occurrence whose owner is the answer, counted once. */
export function AnswerWithheldNotice() {
    const context = useContext(RenderShapesContext);
    if (context === null) return null;
    return (
        <WithheldNotice
            reasons={ownedReasons(context, { kind: "answer" })}
            testId="ask-dev-answer-withheld"
        />
    );
}

/**
 * The ranking panel's chart slot (CHAOS-11944 placed it): the verified cohort shapes, drawn
 * (CHAOS-11943), and a notice for the ones it withholds that the panel's own gate notices do not
 * already state.
 */
export function CohortChartSlot() {
    const context = useContext(RenderShapesContext);
    if (context === null) return <div data-testid="ask-dev-ranking-chart-slot" hidden />;
    const reasons = ownedReasons(context, { kind: "cohort_panel" }).filter(
        (reason) => !RANKING_GATE_REASONS.includes(reason),
    );
    const drawing = context.planned.some((entry) => {
        const kind = context.ledger.outcome(entry.index)?.kind;
        return entry.placement === "cohort_panel" && (kind === "PENDING" || kind === "DRAWN");
    });
    return (
        <div
            data-testid="ask-dev-ranking-chart-slot"
            className="space-y-3"
            hidden={reasons.length === 0 && (!drawing || context.violated)}
        >
            <PlacedFigures
                context={context}
                belongs={(entry) => entry.placement === "cohort_panel"}
            />
            <WithheldNotice reasons={reasons} testId="ask-dev-ranking-chart-withheld" />
        </div>
    );
}
