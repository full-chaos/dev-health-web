"use client";

import { useId, useState } from "react";

import { Button } from "@/components/shared/Button";
import { CTA_LABELS } from "@/lib/design/cta";

type ConsentState =
    | "completed"
    | "denied"
    | "error"
    | "expired"
    | "invalid"
    | "rateLimited"
    | "redirecting"
    | "retryableUnavailable"
    | "review"
    | "unavailable";

// States where the consent panel (client/scope details + Approve/Deny) stays
// visible and usable. "rateLimited" and "retryableUnavailable" are ACR-side
// hiccups on submission, not a verdict on the request itself — the person
// should be able to just wait and press the same button again, not lose the
// request context and see a terminal error.
const INTERACTIVE_STATES: readonly ConsentState[] = [
    "review",
    "rateLimited",
    "retryableUnavailable",
];

// Structural match of `OAuthConsentPreview` in `@/lib/acr/client` (a
// server-only module) — kept as a local shape instead of importing it, so
// this client component never pulls a `server-only` import into the bundle.
type OAuthConsentPreviewData = {
    readonly clientKind: string;
    readonly clientName: string;
    readonly clientSelfAsserted: boolean;
    readonly expiresAt: string;
    readonly redirectOrigin: string;
    readonly resource: string;
    readonly scopes: readonly string[];
};

type OAuthConsentFormProps =
    | {
          readonly handle: string;
          readonly initialState?: undefined;
          readonly preview: OAuthConsentPreviewData;
      }
    | {
          readonly handle?: undefined;
          readonly initialState: Exclude<
              ConsentState,
              "rateLimited" | "redirecting" | "retryableUnavailable" | "review"
          >;
          readonly preview?: undefined;
      };

type DecisionResponse = {
    readonly redirect_url?: unknown;
};

function stateCopy(state: ConsentState): { readonly description: string; readonly title: string } {
    switch (state) {
        case "completed":
            return {
                description: "This request was already completed. Return to your application.",
                title: "Already completed",
            };
        case "denied":
            return {
                description:
                    "This request was not approved. Return to your application to start again.",
                title: "Request not approved",
            };
        case "error":
            return {
                description: "We could not complete this request. Return to your application.",
                title: "Something went wrong",
            };
        case "expired":
            return {
                description:
                    "This authorization link has expired. Return to your application to start again.",
                title: "Link expired",
            };
        case "invalid":
            return {
                description:
                    "This authorization link is invalid. Return to your application and try again.",
                title: "Invalid request",
            };
        case "rateLimited":
            return {
                description: "Review the access requested below before you continue.",
                title: "Too many attempts",
            };
        case "redirecting":
            return {
                description: "Please wait while we send you back to the application.",
                title: "Returning to the application",
            };
        case "retryableUnavailable":
            return {
                description: "Review the access requested below before you continue.",
                title: "Temporarily unavailable",
            };
        case "review":
            return {
                description: "Review the access requested below before you continue.",
                title: "Authorize application",
            };
        case "unavailable":
            return {
                description:
                    "We could not reach the authorization service. Please try again shortly.",
                title: "Temporarily unavailable",
            };
    }
}

function scopeLabel(scope: string): string {
    switch (scope) {
        case "context:read":
            return "Read agent context";
        case "evidence:read":
            return "Read source evidence";
        default:
            return scope;
    }
}

type ErrorResponseBody = {
    readonly error?: {
        readonly retryAfterSeconds?: unknown;
    };
};

function consentErrorState(status: number): ConsentState {
    if (status === 410) return "expired";
    if (status === 409) return "completed";
    if (status === 403) return "denied";
    if (status === 400) return "invalid";
    // ACR's per-handle throttle (wire: {"error":"slow_down"}) and a
    // temporarily-unavailable upstream both stay interactive — see
    // INTERACTIVE_STATES — rather than dropping the request into a terminal
    // "something went wrong" screen.
    if (status === 429) return "rateLimited";
    if (status === 503) return "retryableUnavailable";
    return "error";
}

function waitMessage(retryAfterSeconds: number | undefined): string {
    if (retryAfterSeconds === undefined || retryAfterSeconds <= 0) {
        return "Too many attempts. Please wait, then try again.";
    }
    const unit = retryAfterSeconds === 1 ? "second" : "seconds";
    return `Too many attempts. Wait ${retryAfterSeconds} ${unit}, then try again.`;
}

async function readRetryAfterSeconds(response: Response): Promise<number | undefined> {
    const header = response.headers.get("Retry-After");
    if (header !== null) {
        const parsed = Number(header);
        if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    try {
        const body: ErrorResponseBody = await response.json();
        return typeof body.error?.retryAfterSeconds === "number"
            ? body.error.retryAfterSeconds
            : undefined;
    } catch {
        return undefined;
    }
}

function isSafeRedirectUrl(value: unknown): value is string {
    if (typeof value !== "string" || value.length === 0) return false;
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

export function OAuthConsentForm(props: OAuthConsentFormProps) {
    const [state, setState] = useState<ConsentState>(props.preview ? "review" : props.initialState);
    const [message, setMessage] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const descriptionId = useId();
    const copy = stateCopy(state);
    const preview = props.preview;

    async function decide(action: "approve" | "deny"): Promise<void> {
        if (!props.handle) return;
        setSubmitting(true);
        setMessage(null);
        try {
            const response = await fetch("/api/acr/authorize", {
                body: JSON.stringify(
                    action === "approve"
                        ? { action, handle: props.handle, repository_scopes: ["*"] }
                        : { action, handle: props.handle },
                ),
                headers: { "Content-Type": "application/json" },
                method: "POST",
            });
            if (!response.ok) {
                const nextState = consentErrorState(response.status);
                setState(nextState);
                if (nextState === "rateLimited") {
                    setMessage(waitMessage(await readRetryAfterSeconds(response)));
                } else if (nextState === "retryableUnavailable") {
                    setMessage("We could not reach the authorization service. You can try again.");
                } else {
                    setMessage("We could not complete this request.");
                }
                return;
            }
            const result: DecisionResponse = await response.json();
            if (!isSafeRedirectUrl(result.redirect_url)) {
                setState("error");
                setMessage("We could not return to the application.");
                return;
            }
            setState("redirecting");
            setMessage("Returning to the application…");
            window.location.assign(result.redirect_url);
        } catch {
            setMessage("We could not reach the authorization service. Please try again.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <main className="min-h-[100dvh] bg-background px-4 py-8 text-foreground sm:px-6 sm:py-12">
            <section className="mx-auto w-full max-w-2xl rounded-(--radius-lg) border border-(--card-stroke) bg-(--card-90) p-6 shadow-(--elevation-card) sm:p-8">
                <p className="text-label-caps text-(--ink-muted)">Application sign-in</p>
                <h1 className="mt-2 text-h1 font-semibold">{copy.title}</h1>
                <p id={descriptionId} className="mt-2 text-body text-(--ink-muted)">
                    {copy.description}
                </p>
                <div role="status" aria-live="polite" className="mt-4 text-sm text-(--ink-muted)">
                    {message}
                </div>
                {preview && INTERACTIVE_STATES.includes(state) ? (
                    <div className="mt-6 space-y-6" aria-describedby={descriptionId}>
                        <section className="rounded-(--radius-md) border border-(--card-stroke) bg-background px-4 py-4">
                            <h2 className="text-h3 font-medium">
                                {preview.clientName || "An application"}
                            </h2>
                            {preview.clientSelfAsserted ? (
                                <p className="mt-1 text-sm text-(--ink-muted)">
                                    The application named itself. Approve only if you started this
                                    sign-in.
                                </p>
                            ) : null}
                            <p className="mt-2 text-sm text-(--ink-muted)">
                                It will return to: {preview.redirectOrigin}
                            </p>
                            <p className="mt-1 text-sm text-(--ink-muted)">
                                Resource: {preview.resource}
                            </p>
                            <p className="mt-1 text-sm text-(--ink-muted)">
                                Expires: {preview.expiresAt}
                            </p>
                        </section>
                        <section className="rounded-(--radius-md) border border-(--card-stroke) bg-background px-4 py-4">
                            <h2 className="text-h3 font-medium">Requested access</h2>
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-(--ink-muted)">
                                {preview.scopes.map((scope) => (
                                    <li key={scope}>{scopeLabel(scope)}</li>
                                ))}
                            </ul>
                        </section>
                        <section className="rounded-(--radius-md) border border-(--card-stroke) bg-background px-4 py-4">
                            <h2 className="text-h3 font-medium">All organization repositories</h2>
                            <p className="mt-1 text-sm text-(--ink-muted)">
                                This application can read context from all current and future
                                repositories in your organization. Access never extends to another
                                organization.
                            </p>
                        </section>
                        <div className="flex gap-3">
                            <Button
                                disabled={submitting}
                                onClick={() => void decide("deny")}
                                type="button"
                                variant="secondary"
                            >
                                {submitting ? "Working…" : "Deny"}
                            </Button>
                            <Button
                                disabled={submitting}
                                onClick={() => void decide("approve")}
                                type="button"
                                variant="primary"
                            >
                                {submitting ? "Working…" : CTA_LABELS.approve}
                            </Button>
                        </div>
                    </div>
                ) : null}
            </section>
        </main>
    );
}
