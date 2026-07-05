"use client";

import { useId, useState, type ClipboardEvent, type KeyboardEvent } from "react";

type TokenInputProps = {
    value: string[];
    onChangeAction: (next: string[]) => void;
    placeholder?: string;
    ariaLabel: string;
    className?: string;
};

function splitCandidates(raw: string): string[] {
    return raw
        .split(/[,\s]+/u)
        .map((candidate) => candidate.trim())
        .filter(Boolean);
}

function isSameToken(a: string, b: string): boolean {
    return a.toLowerCase() === b.toLowerCase();
}

/**
 * Token/chip input for string lists (shared primitive, CHAOS-2845
 * Foundations lane): Enter or comma commits the current draft, pasted text
 * splits on commas/whitespace, entries are trimmed, empties are dropped, and
 * duplicates are rejected case-insensitively with visible feedback.
 */
export function TokenInput({
    value,
    onChangeAction,
    placeholder,
    ariaLabel,
    className,
}: TokenInputProps) {
    const [draft, setDraft] = useState("");
    const [feedback, setFeedback] = useState<string | null>(null);
    const feedbackId = useId();

    // Both call sites (Enter/comma commit and paste-split) already trim and
    // drop empty segments before reaching here, so the only outcome this
    // function needs to track is a rejected case-insensitive duplicate.
    function addCandidates(candidates: string[]) {
        const accepted: string[] = [];
        let hadDuplicate = false;

        for (const candidate of candidates) {
            const isDuplicate =
                value.some((existing) => isSameToken(existing, candidate)) ||
                accepted.some((existing) => isSameToken(existing, candidate));
            if (isDuplicate) {
                hadDuplicate = true;
                continue;
            }
            accepted.push(candidate);
        }

        if (accepted.length > 0) {
            onChangeAction([...value, ...accepted]);
        }

        setFeedback(hadDuplicate ? "Already added — duplicates are ignored." : null);
    }

    function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        // IME composition (CJK/Japanese/Korean input): Enter/comma confirm the
        // in-progress composition, not the token — never commit while composing.
        if (event.nativeEvent.isComposing) return;
        if (event.key !== "Enter" && event.key !== ",") return;
        event.preventDefault();
        if (!draft.trim()) return;
        addCandidates([draft.trim()]);
        setDraft("");
    }

    function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
        const text = event.clipboardData.getData("text");
        if (!/[,\s]/u.test(text)) return;
        event.preventDefault();
        addCandidates(splitCandidates(text));
        setDraft("");
    }

    function removeToken(token: string) {
        onChangeAction(value.filter((existing) => existing !== token));
        setFeedback(null);
    }

    return (
        <div className={className}>
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-(--card-stroke) bg-(--card-70) p-2 focus-within:border-(--accent) focus-within:ring-1 focus-within:ring-(--accent)">
                {value.map((token) => (
                    <span
                        key={token}
                        className="inline-flex items-center gap-1 rounded-full border border-(--card-stroke) bg-(--card-80) px-2.5 py-1 text-xs text-foreground"
                    >
                        {token}
                        <button
                            type="button"
                            onClick={() => removeToken(token)}
                            aria-label={`Remove ${token}`}
                            className="text-(--ink-muted) hover:text-(--negative)"
                        >
                            ×
                        </button>
                    </span>
                ))}
                <input
                    type="text"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder={placeholder}
                    aria-label={ariaLabel}
                    aria-describedby={feedback ? feedbackId : undefined}
                    className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-(--ink-muted)"
                />
            </div>
            {feedback ? (
                <p id={feedbackId} role="status" className="mt-1 text-xs text-(--caution)">
                    {feedback}
                </p>
            ) : null}
        </div>
    );
}
