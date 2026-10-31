"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { type AcrCallbackOutcome, completeAcrAuthorization } from "@/lib/ask-dev/acr-auth";
import { CTA_LABELS } from "@/lib/design/cta";
import { logger } from "@/lib/logger";

const log = logger.child({ component: "ask-dev-acr-callback" });

type View =
    | { readonly kind: "working" }
    | { readonly kind: "denied"; readonly returnTo: string }
    | { readonly kind: "failed"; readonly retry: boolean; readonly returnTo: string };

/** The failures where starting again may help; the others ask the user to start from Ask Dev. */
const RETRYABLE = new Set(["token_unavailable", "expired", "claim_unavailable"]);

function viewOf(outcome: Exclude<AcrCallbackOutcome, { kind: "authorized" }>): View {
    if (outcome.kind === "denied") return { kind: "denied", returnTo: outcome.returnTo };
    return { kind: "failed", retry: RETRYABLE.has(outcome.reason), returnTo: outcome.returnTo };
}

function copyOf(view: View): { readonly title: string; readonly description: string } {
    switch (view.kind) {
        case "working":
            return { title: "Connecting Ask Dev", description: "Finishing sign-in to Ask Dev…" };
        case "denied":
            return {
                title: "Ask Dev was not connected",
                description: "Access to Ask Dev was not granted. Return to Ask Dev to try again.",
            };
        case "failed":
            return view.retry
                ? {
                      title: "Ask Dev could not connect",
                      description:
                          "Sign-in to Ask Dev did not finish. Return to Ask Dev to try again.",
                  }
                : {
                      title: "This sign-in link is not valid here",
                      description:
                          "It was not started in this tab, or it was already used. Return to Ask Dev and start again.",
                  };
    }
}

/**
 * The exact redirect URI of web's ACR browser client (CHAOS-12303). ACR sends the tab here with
 * `code`, `state` and `iss` (or `error`). The first thing this page does is take that URL out of
 * the address bar and this history entry. Then it completes the authorization, and on success it
 * returns, client side, to where the user was, so the access token held in memory stays.
 */
export function AcrOAuthCallback() {
    const router = useRouter();
    const [view, setView] = useState<View>({ kind: "working" });
    // One completion per page load: the pending entry is single use, and StrictMode runs effects twice.
    const started = useRef(false);

    useEffect(() => {
        if (started.current) return;
        started.current = true;
        const callbackUrl = window.location.href;
        window.history.replaceState(null, "", window.location.pathname);
        void completeAcrAuthorization(callbackUrl).then((outcome) => {
            if (outcome.kind === "authorized") {
                log.info({ outcome: "authorized" }, "ask-dev acr authorization completed");
                router.replace(outcome.returnTo);
                return;
            }
            log.warn(
                {
                    outcome: outcome.kind,
                    reason: outcome.kind === "failed" ? outcome.reason : outcome.error,
                },
                "ask-dev acr authorization not completed",
            );
            setView(viewOf(outcome));
        });
    }, [router]);

    const copy = copyOf(view);
    return (
        <main className="min-h-[100dvh] bg-background px-4 py-8 text-foreground sm:px-6 sm:py-12">
            <section
                data-testid="ask-dev-acr-callback"
                data-state={view.kind}
                className="mx-auto w-full max-w-2xl rounded-(--radius-lg) border border-(--card-stroke) bg-(--card-90) p-6 shadow-(--elevation-card) sm:p-8"
            >
                <p className="text-label-caps text-(--ink-muted)">Ask Dev</p>
                <h1 className="mt-2 text-h1 font-semibold">{copy.title}</h1>
                <p role="status" aria-live="polite" className="mt-2 text-body text-(--ink-muted)">
                    {copy.description}
                </p>
                {view.kind === "working" ? null : (
                    <Link
                        href={view.returnTo}
                        className="mt-6 inline-flex text-sm font-medium text-(--accent-2) underline-offset-4 hover:underline"
                    >
                        {CTA_LABELS.askDevReturn}
                    </Link>
                )}
            </section>
        </main>
    );
}
