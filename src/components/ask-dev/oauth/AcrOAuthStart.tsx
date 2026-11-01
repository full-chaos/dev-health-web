"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { beginAcrAuthorization } from "@/lib/ask-dev/acr-auth";
import { CTA_LABELS } from "@/lib/design/cta";
import { logger } from "@/lib/logger";
import { safeReturnTo } from "@/lib/onboarding/returnTo";

const log = logger.child({ component: "ask-dev-acr-start" });

type View = "working" | "off" | "unavailable" | "impersonating";

const COPY: Record<View, { readonly title: string; readonly description: string }> = {
    working: { title: "Connecting Ask Dev", description: "Opening sign-in to Ask Dev…" },
    off: {
        title: "Ask Dev sign-in is not available",
        description: "This site does not connect to Ask Dev directly.",
    },
    unavailable: {
        title: "Ask Dev could not be reached",
        description: "Sign-in to Ask Dev did not start. Try again.",
    },
    // No ACR token for an impersonating session (CHAOS-12306): nothing was sent.
    impersonating: {
        title: "Ask Dev is not available while impersonating",
        description: "Stop impersonating to connect Ask Dev.",
    },
};

/**
 * The entry of web's ACR browser authorization (CHAOS-12303): `/ask-dev/oauth/start?return=<path>`.
 * It starts the flow on load and replaces this history entry with ACR's `/authorize`. T14's
 * Connect button links here. `return` must be a same-origin path; anything else returns to `/dev`.
 */
export function AcrOAuthStart() {
    const params = useSearchParams();
    const returnTo = safeReturnTo(params.get("return")) ?? "/dev";
    const [view, setView] = useState<View>("working");
    // One start per page load: StrictMode runs effects twice.
    const started = useRef(false);

    const start = useCallback(() => {
        setView("working");
        void beginAcrAuthorization(returnTo).then((outcome) => {
            if (outcome.kind === "redirected") {
                log.info({ outcome: "redirected" }, "ask-dev acr authorization started");
                return;
            }
            log.warn({ outcome: outcome.kind }, "ask-dev acr authorization not started");
            setView(outcome.kind);
        });
    }, [returnTo]);

    useEffect(() => {
        if (started.current) return;
        started.current = true;
        start();
    }, [start]);

    const copy = COPY[view];
    return (
        <main className="min-h-[100dvh] bg-background px-4 py-8 text-foreground sm:px-6 sm:py-12">
            <section
                data-testid="ask-dev-acr-start"
                data-state={view}
                className="mx-auto w-full max-w-2xl rounded-(--radius-lg) border border-(--card-stroke) bg-(--card-90) p-6 shadow-(--elevation-card) sm:p-8"
            >
                <p className="text-label-caps text-(--ink-muted)">Ask Dev</p>
                <h1 className="mt-2 text-h1 font-semibold">{copy.title}</h1>
                <p role="status" aria-live="polite" className="mt-2 text-body text-(--ink-muted)">
                    {copy.description}
                </p>
                {view === "working" ? null : (
                    <div className="mt-6 flex flex-wrap items-center gap-4">
                        {view === "unavailable" ? (
                            <button
                                type="button"
                                onClick={start}
                                className="inline-flex text-sm font-medium text-(--accent-2) underline-offset-4 hover:underline"
                            >
                                {CTA_LABELS.askDevTryAgain}
                            </button>
                        ) : null}
                        <Link
                            href={returnTo}
                            className="inline-flex text-sm font-medium text-(--accent-2) underline-offset-4 hover:underline"
                        >
                            {CTA_LABELS.askDevReturn}
                        </Link>
                    </div>
                )}
            </section>
        </main>
    );
}
