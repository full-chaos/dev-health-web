"use client";

import { useState } from "react";

import { CTA_LABELS } from "@/lib/design/cta";

/** Where the ACR authorization starts (c2, CHAOS-12303); `return` brings the tab back here. */
export const ACR_OAUTH_START_PATH = "/ask-dev/oauth/start";

/**
 * "Connect Ask Dev" (CHAOS-12104; CHAOS-12336): the tab holds no ACR access, or ACR answered 401.
 * A link to the start page, which owns the flow and its own failures; the panel never starts it by
 * itself, and nothing is retried. A turn, the history list and a conversation that could not be
 * read show it.
 */
export function ConnectAskDev({ testId }: { readonly testId: string }) {
    // The Ask Dev store is client state, so the page is known here.
    const [href] = useState(() =>
        typeof window === "undefined"
            ? ACR_OAUTH_START_PATH
            : `${ACR_OAUTH_START_PATH}?return=${encodeURIComponent(
                  `${window.location.pathname}${window.location.search}`,
              )}`,
    );
    return (
        <a
            href={href}
            data-testid={testId}
            className="inline-flex items-center rounded-(--radius-sm) border border-(--card-stroke) bg-(--surface) px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-(--surface-raised) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)"
        >
            {CTA_LABELS.askDevConnect}
        </a>
    );
}
