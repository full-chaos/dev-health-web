"use client";

import { AskDevConversation } from "./AskDevConversation";

export function AskDevWorkspace() {
    return (
        <section
            className="flex min-h-[calc(100dvh-8rem)] flex-1 flex-col overflow-hidden rounded-(--radius-lg) border border-(--border) bg-(--surface-raised) shadow-(--elevation-card)"
            aria-label="Ask Dev workspace"
        >
            <header className="border-b border-(--border) bg-(--surface)/70 px-5 py-5 sm:px-6">
                <p className="text-label-caps text-(--accent-ai)">Diagnose</p>
                <h1 className="mt-2 font-(--font-display) text-h1 text-(--text-primary)">
                    Ask Dev
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-(--text-secondary)">
                    Investigate delivery status, remaining work, observed changes, registered
                    metrics, and data trust with evidence-linked answers.
                </p>
            </header>
            <AskDevConversation showHistory />
        </section>
    );
}
