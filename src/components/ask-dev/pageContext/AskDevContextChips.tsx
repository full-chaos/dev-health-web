"use client";

import { X } from "lucide-react";

import type { PageEntityRef, ScopeKind } from "@/lib/ask-dev/page-context";
import { CTA_LABELS } from "@/lib/design/cta";

import { useAskDevPageProposal } from "./AskDevPageContext";

export const SCOPE_KIND_LABEL = {
    organization: "Organization",
    team: "Team",
    project: "Project",
    repository: "Repository",
    work_item: "Work item",
    pull_request: "Pull request",
} as const satisfies Record<ScopeKind, string>;

export const CONTEXT_CHIPS_COPY = {
    title: "Context from this page",
    note: "Sent as hints with your next question. Remove any you do not want.",
} as const;

/** The accessible name of a chip's remove button: the action and what it removes. */
export const removeLabel = (ref: PageEntityRef) =>
    `${CTA_LABELS.remove} ${SCOPE_KIND_LABEL[ref.kind]} ${ref.label}`;

/**
 * The page context proposed for the next question, as removable chips (plan §2.4, CHAOS-3584). It
 * shows only what the user can still send: nothing when the page proposes nothing, the feature is
 * off, or every chip was removed. Labels are the page's own text, drawn as inert React text.
 */
export function AskDevContextChips() {
    const { refs, remove } = useAskDevPageProposal();
    if (refs.length === 0) return null;
    return (
        <div
            role="group"
            aria-label={CONTEXT_CHIPS_COPY.title}
            data-testid="ask-dev-context"
            className="space-y-1.5"
        >
            <p className="text-xs text-(--ink-muted)">
                <span className="font-semibold text-foreground">{CONTEXT_CHIPS_COPY.title}</span>
                {" · "}
                {CONTEXT_CHIPS_COPY.note}
            </p>
            <ul className="flex flex-wrap gap-1.5">
                {refs.map((ref) => (
                    <li
                        key={JSON.stringify([ref.kind, ref.id])}
                        data-testid="ask-dev-context-chip"
                        data-kind={ref.kind}
                        className="inline-flex max-w-full items-center gap-1 rounded-full border border-(--card-stroke) bg-(--surface) py-0.5 pr-1 pl-2.5 text-xs text-foreground"
                    >
                        <span className="text-(--ink-muted)">{SCOPE_KIND_LABEL[ref.kind]}:</span>
                        <span className="min-w-0 truncate">{ref.label}</span>
                        <button
                            type="button"
                            onClick={() => remove(ref)}
                            aria-label={removeLabel(ref)}
                            data-testid="ask-dev-context-remove"
                            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-(--ink-muted) transition-colors hover:bg-(--surface-raised) hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)"
                        >
                            <X aria-hidden="true" className="h-3 w-3" />
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
