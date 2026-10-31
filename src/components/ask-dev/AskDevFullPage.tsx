"use client";

import { useId } from "react";
import { Minimize2 } from "lucide-react";

import { useAdminTier } from "@/components/admin/AdminTierContext";
import { PageHeader } from "@/components/shell/PageHeader";
import { isAskDevEnabled } from "@/lib/ask-dev/surface";
import { CTA_LABELS } from "@/lib/design/cta";

import { AskDevComposerSlot, AskDevTranscript, useHasComposer } from "./AskDevConversationView";
import { useAskDevShell } from "./AskDevShellContext";

export const FULL_PAGE_COPY = {
    title: "Ask Dev",
    conversation: "Conversation",
    subtitle: "The same conversation as the panel, with room for wide answers.",
    notAvailable: "Ask Dev is not available for this organization.",
} as const;

/**
 * The full page `/dev` (CHAOS-11934). The transcript and the composer are the panel's own (one
 * store above both), so Expand and Minimize move the view, never the run: no request is sent again.
 * Without both Ask Dev entitlements it says so and draws no conversation.
 */
export function AskDevFullPage() {
    const { features } = useAdminTier();
    const { minimize } = useAskDevShell();
    const enabled = isAskDevEnabled(features);
    // No transport (T14, CHAOS-12104, not wired): no composer, and nothing is sent.
    const hasComposer = useHasComposer();
    const conversationId = useId();

    return (
        <div
            className="flex min-w-0 flex-1 flex-col gap-6 text-foreground"
            data-testid="ask-dev-page"
        >
            <PageHeader
                title={FULL_PAGE_COPY.title}
                subtitle={enabled ? FULL_PAGE_COPY.subtitle : undefined}
                actions={
                    enabled ? (
                        <button
                            type="button"
                            onClick={minimize}
                            data-testid="ask-dev-minimize"
                            className="inline-flex items-center gap-2 rounded-(--radius-sm) border border-(--card-stroke) bg-(--surface) px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-(--surface-raised) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)"
                        >
                            <Minimize2 aria-hidden="true" className="h-4 w-4" />
                            {CTA_LABELS.askDevMinimize}
                        </button>
                    ) : null
                }
            />
            {enabled ? (
                <section
                    aria-labelledby={conversationId}
                    data-testid="ask-dev-page-conversation"
                    className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6"
                >
                    {/* The panel's title is the h2 its answers' h3 parts sit under; here this is. */}
                    <h2 id={conversationId} className="sr-only">
                        {FULL_PAGE_COPY.conversation}
                    </h2>
                    <AskDevTranscript />
                    {hasComposer ? (
                        <div className="sticky bottom-0 border-t border-(--card-stroke) bg-(--surface) py-4">
                            <AskDevComposerSlot />
                        </div>
                    ) : null}
                </section>
            ) : (
                <p className="text-sm text-(--ink-muted)" data-testid="ask-dev-page-not-available">
                    {FULL_PAGE_COPY.notAvailable}
                </p>
            )}
        </div>
    );
}
