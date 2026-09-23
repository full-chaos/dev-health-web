"use client";

import { type SyntheticEvent, useId, useState } from "react";

import { Button } from "@/components/shared/Button";
import { CTA_LABELS } from "@/lib/design/cta";

type ApprovalState = "denied" | "expired" | "pending" | "review" | "success";

type DeviceApprovalFormProps = {
    readonly initialState?: ApprovalState;
    // Prefill from the acr-printed `verification_uri_complete` link
    // (`?user_code=...`, CHAOS-6233's RFC 8628 device grant). The page
    // component validates this against acr's own user-code alphabet before
    // it ever reaches here, so it is trusted input, not raw query text --
    // this form still renders the SAME editable input either way, so a
    // typed or corrected code always works too.
    readonly initialUserCode?: string;
};

type ApprovalResponse = {
    readonly status?: "approved";
};

function stateCopy(state: ApprovalState): { readonly description: string; readonly title: string } {
    switch (state) {
        case "denied":
            return {
                description:
                    "This request was not approved. Return to your terminal to start again.",
                title: "Request not approved",
            };
        case "expired":
            return {
                description: "This code has expired. Return to your terminal to request a new one.",
                title: "Code expired",
            };
        case "pending":
            return {
                description: "Enter the code from your terminal to review the request.",
                title: "Approve device access",
            };
        case "review":
            return {
                description: "Review the organization-wide access requested for this device.",
                title: "Review device access",
            };
        case "success":
            return {
                description:
                    "All current and future repositories in your organization are approved. Return to your terminal to finish sign-in.",
                title: "Approval complete",
            };
    }
}

function errorState(response: Response): ApprovalState {
    // acr's device-approval endpoint (internal/api/device_routes.go
    // writeDeviceApprovalError) collapses "no such device authorization",
    // "wrong flow", and "expired" into ONE wire shape: HTTP 400
    // invalid_request -- it never emits 410, and the web layer cannot tell
    // which of the three happened, including whether the code was simply
    // TYPED WRONG (still 8 valid-alphabet characters, but never issued).
    // That ambiguity means a 400 must stay in "pending" -- it keeps the
    // typed-entry recovery path available for a mistyped code, same as
    // before this ticket's fix -- rather than moving to a terminal state
    // that only fits the unambiguous "restart from scratch" cases. What
    // was actually missing (CHAOS-6317: chris's failed Approve clicks
    // landed seconds after that code's expiry) was a clear MESSAGE, not a
    // different state; see `statusMessage` below. "expired" stays reserved
    // for a real HTTP 410 (acr does not currently send one, kept for
    // forward compatibility) since that status is unambiguous -- retyping
    // never recovers it.
    if (response.status === 410) return "expired";
    if (response.status === 403 || response.status === 409) return "denied";
    return "pending";
}

function statusMessage(response: Response, action: "approve" | "preview"): string {
    if (response.status === 429) return "Too many attempts. Please wait before trying again.";
    if (response.status === 400) {
        // Covers acr's collapsed "no such authorization" / "wrong flow" /
        // "expired" shape (see errorState above) -- never asserts a single
        // cause, and names both recovery paths since a typo is exactly as
        // likely here as a genuinely stale code.
        return "This code is no longer valid — it may have expired, already been used, or been typed incorrectly. Check the code and try again, or return to your terminal to start over.";
    }
    return action === "preview"
        ? "We could not preview this request."
        : "We could not approve this request.";
}

export function DeviceApprovalForm({
    initialState = "pending",
    initialUserCode,
}: DeviceApprovalFormProps) {
    const [code, setCode] = useState(initialUserCode ?? "");
    const [state, setState] = useState<ApprovalState>(initialState);
    const [message, setMessage] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const descriptionId = useId();
    const stateMessage = stateCopy(state);

    async function submitPreview(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        setSubmitting(true);
        setMessage(null);
        try {
            const response = await fetch("/api/acr/device", {
                body: JSON.stringify({ action: "preview", user_code: code }),
                headers: { "Content-Type": "application/json" },
                method: "POST",
            });
            const result = await response.json();
            if (response.ok && Array.isArray(result.repositoryHints)) {
                setState("review");
                return;
            }
            setState(errorState(response));
            setMessage(statusMessage(response, "preview"));
        } catch {
            setMessage("We could not reach the approval service. Please try again.");
        } finally {
            setSubmitting(false);
        }
    }

    async function submitApprove(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        setSubmitting(true);
        setMessage(null);
        try {
            const response = await fetch("/api/acr/device", {
                body: JSON.stringify({
                    action: "approve",
                    repository_scopes: ["*"],
                    user_code: code,
                }),
                headers: { "Content-Type": "application/json" },
                method: "POST",
            });
            const result: ApprovalResponse = await response.json();
            if (response.ok && result.status === "approved") {
                setState("success");
                return;
            }
            setState(errorState(response));
            setMessage(statusMessage(response, "approve"));
        } catch {
            setMessage("We could not reach the approval service. Please try again.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <main className="min-h-[100dvh] bg-background px-4 py-8 text-foreground sm:px-6 sm:py-12">
            <section className="mx-auto w-full max-w-2xl rounded-(--radius-lg) border border-(--card-stroke) bg-(--card-90) p-6 shadow-(--elevation-card) sm:p-8">
                <p className="text-label-caps text-(--ink-muted)">Device approval</p>
                <h1 className="mt-2 text-h1 font-semibold">{stateMessage.title}</h1>
                <p id={descriptionId} className="mt-2 text-body text-(--ink-muted)">
                    {stateMessage.description}
                </p>
                <div role="status" aria-live="polite" className="mt-4 text-sm text-(--ink-muted)">
                    {message}
                </div>
                {state === "pending" ? (
                    <form
                        onSubmit={submitPreview}
                        className="mt-6 space-y-6"
                        aria-describedby={descriptionId}
                    >
                        <div>
                            <label htmlFor="device-code" className="text-h3 font-medium">
                                Verification code
                            </label>
                            <input
                                id="device-code"
                                autoCapitalize="characters"
                                autoComplete="one-time-code"
                                className="mt-2 w-full rounded-(--radius-md) border border-(--card-stroke) bg-background px-4 py-3 font-mono tracking-[0.16em] uppercase outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
                                maxLength={8}
                                onChange={(event) =>
                                    setCode(event.target.value.trim().toUpperCase())
                                }
                                required
                                value={code}
                            />
                        </div>
                        <Button
                            disabled={submitting || code.length !== 8}
                            type="submit"
                            variant="primary"
                        >
                            {submitting ? "Loading…" : "Preview request"}
                        </Button>
                    </form>
                ) : null}
                {state === "review" ? (
                    <form
                        onSubmit={submitApprove}
                        className="mt-6 space-y-6"
                        aria-describedby={descriptionId}
                    >
                        <section
                            aria-labelledby="organization-repositories-title"
                            className="rounded-(--radius-md) border border-(--card-stroke) bg-background px-4 py-4"
                        >
                            <h2
                                id="organization-repositories-title"
                                className="text-h3 font-medium"
                            >
                                All organization repositories
                            </h2>
                            <p className="mt-1 text-sm text-(--ink-muted)">
                                This device can read context from all current and future
                                repositories in your organization. Access never extends to another
                                organization.
                            </p>
                        </section>
                        <div className="flex gap-3">
                            <Button
                                disabled={submitting}
                                onClick={() => setState("pending")}
                                type="button"
                                variant="secondary"
                            >
                                {CTA_LABELS.backButton}
                            </Button>
                            <Button disabled={submitting} type="submit" variant="primary">
                                {submitting ? "Approving…" : CTA_LABELS.confirm}
                            </Button>
                        </div>
                    </form>
                ) : null}
            </section>
        </main>
    );
}
