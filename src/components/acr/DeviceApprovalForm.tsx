"use client";

import { type SyntheticEvent, useId, useState } from "react";

import { Button } from "@/components/shared/Button";
import { CTA_LABELS } from "@/lib/design/cta";

type ApprovalState = "denied" | "expired" | "pending" | "review" | "success";

type DeviceApprovalFormProps = {
    readonly initialState?: ApprovalState;
    readonly repositories: readonly string[];
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
                description: "Select the repositories to approve for this device.",
                title: "Review device access",
            };
        case "success":
            return {
                description:
                    "Your selected repositories are approved. Return to your terminal to finish sign-in.",
                title: "Approval complete",
            };
    }
}

function errorState(response: Response): ApprovalState {
    if (response.status === 410) return "expired";
    if (response.status === 403 || response.status === 409) return "denied";
    return "pending";
}

function repositoriesForHints(
    repositories: readonly string[],
    hints: readonly string[],
): readonly string[] {
    if (hints.length === 0) return repositories;
    return repositories.filter((repository) => hints.includes(repository));
}

export function DeviceApprovalForm({
    initialState = "pending",
    repositories,
}: DeviceApprovalFormProps) {
    const [code, setCode] = useState("");
    const [selected, setSelected] = useState<readonly string[]>([]);
    const [state, setState] = useState<ApprovalState>(initialState);
    const [message, setMessage] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [hints, setHints] = useState<readonly string[]>([]);
    const descriptionId = useId();
    const stateMessage = stateCopy(state);
    const availableRepositories = repositoriesForHints(repositories, hints);

    function toggleRepository(repository: string): void {
        setSelected((current) =>
            current.includes(repository)
                ? current.filter((selectedRepository) => selectedRepository !== repository)
                : [...current, repository].sort((left, right) => left.localeCompare(right)),
        );
    }

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
            if (response.ok && result.repositoryHints) {
                setHints(result.repositoryHints);
                const available = repositoriesForHints(repositories, result.repositoryHints);
                setSelected(available);
                setState("review");
                return;
            }
            setState(errorState(response));
            setMessage(
                response.status === 429
                    ? "Too many attempts. Please wait before trying again."
                    : "We could not preview this request.",
            );
        } catch {
            setMessage("We could not reach the approval service. Please try again.");
        } finally {
            setSubmitting(false);
        }
    }

    async function submitApprove(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        if (selected.length === 0) {
            setMessage("Select at least one repository to continue.");
            return;
        }
        setSubmitting(true);
        setMessage(null);
        try {
            const response = await fetch("/api/acr/device", {
                body: JSON.stringify({
                    action: "approve",
                    repository_scopes: selected,
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
            setMessage(
                response.status === 429
                    ? "Too many attempts. Please wait before trying again."
                    : "We could not approve this request.",
            );
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
                        <fieldset>
                            <legend className="text-h3 font-medium">Repositories to approve</legend>
                            <p className="mt-1 text-sm text-(--ink-muted)">
                                Only repositories you are authorized to access are available.
                            </p>
                            <div className="mt-3 divide-y divide-(--card-stroke) rounded-(--radius-md) border border-(--card-stroke)">
                                {availableRepositories.map((repository) => (
                                    <label
                                        key={repository}
                                        className="flex cursor-pointer items-center gap-3 px-4 py-3 text-body hover:bg-(--card-80)"
                                    >
                                        <input
                                            checked={selected.includes(repository)}
                                            onChange={() => toggleRepository(repository)}
                                            type="checkbox"
                                        />
                                        <span>{repository}</span>
                                    </label>
                                ))}
                                {availableRepositories.length === 0 && (
                                    <div className="px-4 py-3 text-body text-(--ink-muted)">
                                        No authorized repositories match this request.
                                    </div>
                                )}
                            </div>
                        </fieldset>
                        <div className="flex gap-3">
                            <Button
                                disabled={submitting}
                                onClick={() => setState("pending")}
                                type="button"
                                variant="secondary"
                            >
                                {CTA_LABELS.backButton}
                            </Button>
                            <Button
                                disabled={submitting || selected.length === 0}
                                type="submit"
                                variant="primary"
                            >
                                {submitting ? "Approving…" : CTA_LABELS.confirm}
                            </Button>
                        </div>
                    </form>
                ) : null}
            </section>
        </main>
    );
}
