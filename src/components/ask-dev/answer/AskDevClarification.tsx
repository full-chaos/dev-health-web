"use client";

import { useId, useState } from "react";
import { Check } from "lucide-react";

import { ANSWER_STATUS_LABEL } from "./answerModel";
import {
    CLARIFICATION_COPY,
    buildChoice,
    clarificationPrompt,
    familiesOf,
    offersOf,
    type ClarificationChoice,
    type Offer,
    type OfferFamily,
    type TurnResult,
} from "./clarificationModel";
import { SafeAnswerText } from "./SafeAnswerText";
import { nonBlank } from "@/lib/ask-dev/conversation";

const PILL =
    "inline-flex items-center rounded-full border border-(--card-stroke) px-2 py-0.5 text-xs font-medium";
const CHIP =
    "inline-flex items-center rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2) disabled:opacity-60";

function OfferGroup({
    family,
    offers,
    picked,
    onPick,
}: {
    family: OfferFamily;
    offers: readonly Offer[];
    picked: string | undefined;
    /** Absent on a read-only turn: the offers are listed, with no control. */
    onPick: ((receiptId: string | undefined) => void) | undefined;
}) {
    const titleId = useId();
    return (
        <section
            aria-labelledby={titleId}
            className="space-y-2"
            data-testid="ask-dev-clarification-family"
            data-family={family}
        >
            <h3 id={titleId} className="text-sm font-semibold text-foreground">
                {CLARIFICATION_COPY.familyTitle[family]}
            </h3>
            {offers.length === 0 ? (
                <p className="text-sm text-(--ink-muted)">{CLARIFICATION_COPY.noOffers}</p>
            ) : onPick === undefined ? (
                <p
                    className="text-sm text-(--ink-muted)"
                    data-testid="ask-dev-clarification-offered"
                >
                    {CLARIFICATION_COPY.offered}: {offers.map((offer) => offer.label).join(", ")}
                </p>
            ) : (
                <ul className="flex flex-wrap gap-2">
                    {offers.map((offer) => {
                        const selected = picked === offer.receiptId;
                        return (
                            <li key={offer.optionId}>
                                <button
                                    type="button"
                                    aria-pressed={selected}
                                    data-testid="ask-dev-clarification-chip"
                                    onClick={() => onPick(selected ? undefined : offer.receiptId)}
                                    className={`${CHIP} ${
                                        selected
                                            ? "border-(--accent-2) bg-(--accent-2)/25 font-semibold text-foreground"
                                            : "border-(--card-stroke) bg-(--surface) text-foreground hover:bg-(--surface-raised)"
                                    }`}
                                >
                                    {selected ? (
                                        <Check aria-hidden="true" className="mr-1 h-3.5 w-3.5" />
                                    ) : null}
                                    {offer.label}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

/**
 * A clarification or non-answer turn (CHAOS-3440): the service's sentence and prompt, then the
 * choices it offered for each missing part (kind, anchor, item, time period, candidate), as served.
 * On the live turn (`onConfirm` given) a choice is one tap per part, and "Ask again" sends them once
 * as receipts bound to THIS result (INV-1). A prior turn is read-only: the offers are listed, with
 * no control that could send an old receipt.
 */
export function AskDevClarification({
    result,
    onConfirm,
}: {
    result: TurnResult;
    onConfirm?: (choice: ClarificationChoice) => void;
}) {
    const offers = offersOf(result);
    const families = familiesOf(result);
    const lead = nonBlank(result.deterministic_answer);
    // The service often ends its sentence with the prompt itself: show the prompt only when the
    // sentence does not already hold it word for word.
    const servedPrompt = clarificationPrompt(result);
    const prompt =
        servedPrompt !== null && lead !== undefined && lead.includes(servedPrompt.trim())
            ? null
            : servedPrompt;
    const [picks, setPicks] = useState<Partial<Record<OfferFamily, string>>>({});
    const [sent, setSent] = useState(false);
    const live = onConfirm !== undefined && !sent;
    const chosen = Object.values(picks).some((value) => value !== undefined);
    const hasOffers = families.some((family) => offers[family].length > 0);

    return (
        <article
            className="space-y-4"
            data-testid="ask-dev-clarification"
            data-status={result.status}
            data-live={live ? "true" : "false"}
        >
            <div className="space-y-2">
                <span className={`${PILL} text-foreground`} data-testid="ask-dev-answer-status">
                    {ANSWER_STATUS_LABEL[result.status]}
                </span>
                {lead === undefined ? null : (
                    <p
                        className="text-base font-semibold text-foreground"
                        data-testid="ask-dev-answer-lead"
                    >
                        <SafeAnswerText text={lead} />
                    </p>
                )}
                {prompt === null ? null : (
                    <p
                        className="text-sm text-foreground"
                        data-testid="ask-dev-clarification-prompt"
                    >
                        <SafeAnswerText text={prompt} />
                    </p>
                )}
                {onConfirm === undefined ? (
                    <p
                        className="text-xs text-(--ink-muted)"
                        data-testid="ask-dev-clarification-prior"
                    >
                        {CLARIFICATION_COPY.priorTurnNote}
                    </p>
                ) : null}
            </div>

            {families.map((family) => (
                <OfferGroup
                    key={family}
                    family={family}
                    offers={offers[family]}
                    picked={picks[family]}
                    onPick={
                        live
                            ? (receiptId) => setPicks((now) => ({ ...now, [family]: receiptId }))
                            : undefined
                    }
                />
            ))}

            {onConfirm === undefined || !hasOffers ? null : (
                <div className="space-y-1">
                    <button
                        type="button"
                        data-testid="ask-dev-clarification-ask-again"
                        disabled={!live || !chosen}
                        onClick={() => {
                            onConfirm(buildChoice(result, picks));
                            setSent(true);
                        }}
                        className="inline-flex items-center rounded-(--radius-sm) bg-(--accent-2) px-3 py-1.5 text-sm font-semibold text-(--surface) transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2) disabled:opacity-50"
                    >
                        {sent ? CLARIFICATION_COPY.asked : CLARIFICATION_COPY.askAgain}
                    </button>
                    {live && !chosen ? (
                        <p className="text-xs text-(--ink-muted)">
                            {CLARIFICATION_COPY.chooseFirst}
                        </p>
                    ) : null}
                </div>
            )}
        </article>
    );
}
