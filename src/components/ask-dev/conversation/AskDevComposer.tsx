"use client";

import { useId, useState, type KeyboardEvent } from "react";

import { nonBlank } from "@/lib/ask-dev/conversation";
import { CTA_LABELS } from "@/lib/design/cta";

export const COMPOSER_COPY = {
    label: "Ask a question",
    placeholder: "Ask about your teams, projects or repositories",
    signedOut: "Sign in again to ask a question.",
} as const;

const BUTTON =
    "inline-flex items-center rounded-(--radius-sm) px-3 py-1.5 text-sm font-semibold transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2) disabled:opacity-50";

/**
 * The Ask Dev composer (CHAOS-11928). Enter sends, Shift+Enter starts a new line. The store decides
 * whether a submit is sent: `onSubmit` returns `false` for a blank question or while a run is in
 * flight, so a double click sends one request. Send stays where it is (disabled) while a run is in
 * flight, and Stop appears beside it, so a fast second click never lands on Stop.
 */
export function AskDevComposer({
    inFlight,
    ready,
    onSubmit,
    onCancel,
}: {
    inFlight: boolean;
    /** False while signed out: the composer says so and sends nothing. */
    ready: boolean;
    onSubmit: (question: string) => boolean;
    onCancel: () => void;
}) {
    const [draft, setDraft] = useState("");
    const fieldId = useId();
    const blank = nonBlank(draft.trim()) === undefined;

    const send = () => {
        if (onSubmit(draft)) setDraft("");
    };
    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
        event.preventDefault();
        send();
    };

    return (
        <form
            aria-label={COMPOSER_COPY.label}
            data-testid="ask-dev-composer"
            className="space-y-2"
            onSubmit={(event) => {
                event.preventDefault();
                send();
            }}
        >
            <label htmlFor={fieldId} className="sr-only">
                {COMPOSER_COPY.label}
            </label>
            <textarea
                id={fieldId}
                data-testid="ask-dev-composer-input"
                rows={3}
                value={draft}
                disabled={!ready}
                placeholder={COMPOSER_COPY.placeholder}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
                className="w-full resize-none rounded-(--radius-sm) border border-(--card-stroke) bg-(--surface) px-3 py-2 text-sm text-foreground outline-none focus:border-(--accent-2) disabled:opacity-50"
            />
            {!ready ? (
                <p className="text-sm text-(--ink-muted)">{COMPOSER_COPY.signedOut}</p>
            ) : null}
            <div className="flex justify-end gap-2">
                {inFlight ? (
                    <button
                        type="button"
                        data-testid="ask-dev-composer-stop"
                        onClick={onCancel}
                        className={`${BUTTON} border border-(--card-stroke) bg-(--surface) text-foreground hover:bg-(--surface-raised)`}
                    >
                        {CTA_LABELS.askDevStop}
                    </button>
                ) : null}
                <button
                    type="submit"
                    data-testid="ask-dev-composer-send"
                    disabled={!ready || inFlight || blank}
                    className={`${BUTTON} bg-(--accent-2) text-(--surface) hover:opacity-90`}
                >
                    {CTA_LABELS.askDevSend}
                </button>
            </div>
        </form>
    );
}
