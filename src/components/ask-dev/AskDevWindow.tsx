"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { CTA_LABELS } from "@/lib/design/cta";

import { AskDevConversation } from "./AskDevConversation";
import { useAskDev } from "./AskDevProvider";

export function AskDevWindow() {
    const { closePanel, panelMode, openPanel, setPanelMode } = useAskDev();
    const launcherRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLElement>(null);

    useEffect(() => {
        if (panelMode !== "closed") panelRef.current?.focus();
    }, [panelMode]);

    const closeAndRestoreFocus = () => {
        closePanel();
        requestAnimationFrame(() => launcherRef.current?.focus());
    };

    if (panelMode === "closed") {
        return (
            <button
                ref={launcherRef}
                type="button"
                onClick={openPanel}
                className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-(--radius-pill) border border-(--accent-ai)/35 bg-(--surface-raised) px-4 py-3 font-medium text-(--text-primary) shadow-(--elevation-drawer) transition hover:-translate-y-0.5 hover:border-(--accent-ai)/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ai)/50"
                aria-label={CTA_LABELS.openAskDev}
            >
                <span
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-(--accent-ai)/15 text-(--accent-ai)"
                    aria-hidden="true"
                >
                    ✦
                </span>
                <span>Ask Dev</span>
            </button>
        );
    }

    const expanded = panelMode === "expanded";
    return (
        <section
            ref={panelRef}
            tabIndex={-1}
            aria-label="Ask Dev"
            className={`fixed z-50 flex flex-col overflow-hidden border border-(--border) bg-(--surface-raised) shadow-(--elevation-drawer) outline-none max-sm:inset-0 max-sm:h-dvh ${
                expanded
                    ? "bottom-4 right-4 top-4 w-[min(46rem,calc(100vw-2rem))] rounded-(--radius-lg)"
                    : "bottom-4 right-4 h-[min(44rem,calc(100dvh-2rem))] w-[min(28rem,calc(100vw-2rem))] rounded-(--radius-lg)"
            }`}
            onKeyDown={(event) => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    closeAndRestoreFocus();
                }
            }}
        >
            <header className="flex items-center justify-between gap-3 border-b border-(--border) bg-(--surface)/80 px-4 py-3">
                <div className="min-w-0">
                    <p className="text-label-caps text-(--accent-ai)">
                        Evidence-backed investigation
                    </p>
                    <h2 className="truncate font-(--font-display) text-h3 text-(--text-primary)">
                        Ask Dev
                    </h2>
                </div>
                <div className="flex items-center gap-1">
                    <Link
                        href="/dev"
                        className="rounded-(--radius-sm) px-2 py-1.5 text-xs font-medium text-(--text-secondary) transition hover:bg-(--surface-raised) hover:text-(--text-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ai)/45"
                    >
                        {CTA_LABELS.askDevWorkspace}
                    </Link>
                    <button
                        type="button"
                        onClick={() => setPanelMode(expanded ? "compact" : "expanded")}
                        aria-label={expanded ? CTA_LABELS.reduceAskDev : CTA_LABELS.expandAskDev}
                        className="rounded-(--radius-sm) px-2 py-1.5 text-(--text-secondary) hover:bg-(--surface-raised) hover:text-(--text-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ai)/45"
                    >
                        <span aria-hidden="true">{expanded ? "↘" : "↖"}</span>
                    </button>
                    <button
                        type="button"
                        onClick={closeAndRestoreFocus}
                        aria-label={CTA_LABELS.closePanel}
                        className="rounded-(--radius-sm) px-2 py-1.5 text-(--text-secondary) hover:bg-(--surface-raised) hover:text-(--text-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ai)/45"
                    >
                        <span aria-hidden="true">—</span>
                    </button>
                </div>
            </header>
            <AskDevConversation compact />
        </section>
    );
}
