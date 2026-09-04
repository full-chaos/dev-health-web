"use client";

import Link from "next/link";

import { CTA_LABELS } from "@/lib/design/cta";

import { AskDevConversation } from "./AskDevConversation";
import { useAskDev } from "./AskDevProvider";

export function AskDevWorkspace() {
    const { persistentReturnHref, returnToPersistentWindow } = useAskDev();

    return (
        <section
            // CHAOS-3524: this must be a hard height CEILING, not just a
            // floor. `min-h-*` alone let the section grow past the
            // viewport once a conversation got tall — with nothing above
            // it actually capping height, AskDevConversation's own
            // `overflow-y-auto` transcript region never became smaller
            // than its content, so it never scrolled internally; the whole
            // PAGE scrolled instead, and the "fixed" composer scrolled
            // away with it (found via live visual verification — the
            // composer's bounding-box top measured in the thousands of px
            // mid-conversation).
            //
            // `h-[calc(100dvh-8rem)]` ALONE is not enough, and live
            // verification caught that too: this section was also
            // `flex-1` (to grow inside its parent `<main>`), and per the
            // flexbox spec `flex-1` sets `flex-basis: 0%`, which wins over
            // an explicit `height` for main-axis sizing — the item's real
            // size came from `flex-grow` against the parent's available
            // space instead, and nothing in the ancestor chain up to the
            // page root supplies a bounded height for that to grow inside
            // of (`min-h-screen`, not `h-screen`/`h-dvh`), so it grew to
            // fit content anyway and `overflow-hidden` here stayed inert.
            // Dropping `flex-1` lets the explicit `h-*` win outright: this
            // section is nothing else's flex sibling that needs the
            // remaining space (it's `<main>`'s last child), so a fixed
            // height instead of a grown one costs nothing.
            className="flex h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-(--radius-lg) border border-(--border) bg-(--surface-raised) shadow-(--elevation-card)"
            aria-label="Ask Dev workspace"
        >
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-(--border) bg-(--surface)/70 px-5 py-5 sm:px-6">
                <div>
                    <p className="text-label-caps text-(--accent-ai)">Diagnose</p>
                    <h1 className="mt-2 font-(--font-display) text-h1 text-(--text-primary)">
                        Ask Dev
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-(--text-secondary)">
                        Investigate delivery status, remaining work, observed changes, registered
                        metrics, and data trust with evidence-linked answers.
                    </p>
                </div>
                <Link
                    href={persistentReturnHref}
                    onClick={returnToPersistentWindow}
                    className="inline-flex shrink-0 items-center gap-2 rounded-(--radius-pill) border border-(--border) bg-(--surface-raised) px-3 py-2 text-xs font-medium text-(--text-secondary) transition hover:border-(--accent-ai)/45 hover:text-(--text-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ai)/45"
                >
                    <span aria-hidden="true">↙</span>
                    {CTA_LABELS.returnToAskDevWindow}
                </Link>
            </header>
            <AskDevConversation showHistory />
        </section>
    );
}
