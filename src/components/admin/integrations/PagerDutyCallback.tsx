"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { completePagerDutyOAuth } from "@/lib/admin/server";
import { pagerDutySyncConfigPath } from "@/lib/admin/syncConfigPreselection";
import { DataState } from "@/components/ui/DataState";
import { CTA_LABELS } from "@/lib/design/cta";

type CallbackState = "pending" | "connected" | "failed";
const PAGERDUTY_CALLBACK_PATH = "/org/admin/integrations/pagerduty/callback";

function sanitizeCallbackUrl(): void {
    if (
        window.location.pathname !== PAGERDUTY_CALLBACK_PATH ||
        window.location.search.length === 0
    ) {
        return;
    }
    window.history.replaceState(window.history.state, "", PAGERDUTY_CALLBACK_PATH);
}

export function PagerDutyCallback() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [, startTransition] = useTransition();
    const callbackCompletionStarted = useRef(false);

    const state = searchParams.get("state");
    const code = searchParams.get("code");
    const authorizationError = searchParams.get("error");
    const isCompleteResponse = Boolean(state && (code || authorizationError));
    const hasCallbackQuery = Boolean(state || code || authorizationError);
    const [callbackState, setCallbackState] = useState<CallbackState>(() =>
        isCompleteResponse ? "pending" : "failed",
    );
    const [message, setMessage] = useState(() =>
        isCompleteResponse
            ? "Finishing your PagerDuty connection…"
            : "PagerDuty did not return a complete authorization response.",
    );

    useEffect(() => {
        const originalPushState = window.history.pushState;
        window.history.pushState = function (...args) {
            originalPushState.apply(this, args);
            if (callbackCompletionStarted.current) sanitizeCallbackUrl();
        };
        return () => {
            window.history.pushState = originalPushState;
        };
    }, []);

    useEffect(() => {
        if (hasCallbackQuery && !isCompleteResponse) sanitizeCallbackUrl();
        if (!isCompleteResponse || !state || callbackCompletionStarted.current) return;
        callbackCompletionStarted.current = true;
        startTransition(async () => {
            try {
                const result = await completePagerDutyOAuth({
                    state,
                    ...(code ? { code } : {}),
                    ...(authorizationError ? { error: authorizationError } : {}),
                });
                if (result.error) {
                    setCallbackState("failed");
                    setMessage(result.error);
                    sanitizeCallbackUrl();
                    return;
                }
                if (!result.data) {
                    setCallbackState("failed");
                    setMessage("PagerDuty authorization could not be completed.");
                    sanitizeCallbackUrl();
                    return;
                }
                setCallbackState("connected");
                setMessage("PagerDuty is connected. Opening Sync Status…");
                router.replace(pagerDutySyncConfigPath(result.data.credential_name));
            } catch (e) {
                setCallbackState("failed");
                setMessage("An unexpected error occurred during authorization.");
                sanitizeCallbackUrl();
            }
        });
    }, [
        authorizationError,
        code,
        hasCallbackQuery,
        isCompleteResponse,
        router,
        startTransition,
        state,
    ]);

    return (
        <section className="mx-auto max-w-xl space-y-4 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6">
            <h1 className="text-h1 text-foreground">PagerDuty connection</h1>
            {callbackState === "failed" ? (
                <div role="alert">
                    <DataState
                        variant="error"
                        title="PagerDuty connection failed"
                        message={message}
                        action={
                            <Link
                                href="/org/admin/integrations/pagerduty"
                                className="inline-flex rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-(--accent-foreground)"
                            >
                                {CTA_LABELS.manageCredential}
                            </Link>
                        }
                    />
                </div>
            ) : (
                <p role="status" className="text-body text-(--ink-muted)">
                    {message}
                </p>
            )}
            {callbackState === "connected" && (
                <Link
                    href="/org/admin/integrations/pagerduty"
                    className="inline-flex rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-(--accent-foreground)"
                >
                    {CTA_LABELS.manageCredential}
                </Link>
            )}
        </section>
    );
}
