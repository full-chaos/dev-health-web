"use client";

import Link from "next/link";

import { CTA_LABELS } from "@/lib/design/cta";

import { AskDevConversation } from "./AskDevConversation";
import { useAskDev } from "./AskDevProvider";

export function AskDevWorkspace() {
    const { persistentReturnHref, returnToPersistentWindow } = useAskDev();

    return (
        <section
            className="flex min-h-[calc(100dvh-8rem)] flex-1 flex-col overflow-hidden rounded-(--radius-lg) border border-(--border) bg-(--surface-raised) shadow-(--elevation-card)"
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
