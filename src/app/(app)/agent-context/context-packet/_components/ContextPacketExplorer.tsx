"use client";

import { useEffect, useRef, useState } from "react";
import type { ACRContextPacketV1 } from "@/lib/acr/generated";
import { DataState } from "@/components/ui/DataState";
import { CTA_LABELS } from "@/lib/design/cta";
import { ContextPacketDetails } from "./ContextPacketDetails";
import type { ControlledPacketState } from "./contextPacketStates";
import { SAMPLE_CONTEXT_PACKET, SAMPLE_EXPANDED_EVIDENCE } from "./samplePacket";

export type { ControlledPacketState } from "./contextPacketStates";

type ContextPacketExplorerProps = {
    readonly controlledState: ControlledPacketState;
};

type RequestForm = {
    readonly goal: string;
    readonly repository: string;
    readonly branchOrCommit: string;
    readonly taskReference: string;
};

const SAMPLE_REQUEST: RequestForm = {
    goal: SAMPLE_CONTEXT_PACKET.goal,
    repository: SAMPLE_CONTEXT_PACKET.repository.slug,
    branchOrCommit: SAMPLE_CONTEXT_PACKET.resolved_scope.commit_sha ?? "",
    taskReference: SAMPLE_CONTEXT_PACKET.requested_scope.task_ref ?? "",
};

const AUTHORIZED_REPOSITORIES = [SAMPLE_CONTEXT_PACKET.repository.slug] as const;

function projectPacket(form: RequestForm): ACRContextPacketV1 {
    const { task_ref: _taskReference, ...requestedScope } = SAMPLE_CONTEXT_PACKET.requested_scope;
    const { commit_sha: _commitSHA, ...resolvedScope } = SAMPLE_CONTEXT_PACKET.resolved_scope;
    return {
        ...SAMPLE_CONTEXT_PACKET,
        goal: form.goal,
        repository: { ...SAMPLE_CONTEXT_PACKET.repository, slug: form.repository },
        requested_scope: {
            ...requestedScope,
            ...(form.taskReference ? { task_ref: form.taskReference } : {}),
        },
        resolved_scope: {
            ...resolvedScope,
            repo_slug: form.repository,
            ...(form.branchOrCommit ? { commit_sha: form.branchOrCommit } : {}),
        },
    };
}

function ControlledState({
    state,
    focusPacket,
    packet,
}: {
    readonly state: ControlledPacketState;
    readonly focusPacket: boolean;
    readonly packet: ACRContextPacketV1;
}) {
    switch (state) {
        case "loading":
            return (
                <DataState
                    variant="loading"
                    title="Preparing context packet"
                    className="min-h-24"
                />
            );
        case "empty":
            return (
                <DataState
                    variant="detector-enabled-no-findings"
                    title="No context matched this scope"
                    description="Refine the goal or scope and try again."
                    data-testid="data-state-empty"
                />
            );
        case "error":
            return (
                <DataState
                    variant="error"
                    title="Context packet could not be generated"
                    message="Try again when the service is available."
                    data-testid="data-state-error"
                />
            );
        case "not-entitled":
            return (
                <DataState
                    variant="no-data-connected"
                    title="Agent Context Runtime is not available for this organization"
                    description="Ask an organization administrator to review product access."
                    data-testid="data-state-not-entitled"
                />
            );
        case "degraded":
            return (
                <ContextPacketDetails
                    packet={{ ...packet, status: "degraded" }}
                    degraded
                    autoFocus={focusPacket}
                    evidenceByID={SAMPLE_EXPANDED_EVIDENCE}
                />
            );
        case "sample":
            return (
                <ContextPacketDetails
                    packet={packet}
                    autoFocus={focusPacket}
                    evidenceByID={SAMPLE_EXPANDED_EVIDENCE}
                />
            );
    }
}

export function ContextPacketExplorer({ controlledState }: ContextPacketExplorerProps) {
    const [form, setForm] = useState(SAMPLE_REQUEST);
    const [submitted, setSubmitted] = useState<ControlledPacketState | null>(null);
    const [goalError, setGoalError] = useState<string | null>(null);
    const [packet, setPacket] = useState<ACRContextPacketV1>(SAMPLE_CONTEXT_PACKET);
    const goalRef = useRef<HTMLTextAreaElement>(null);
    const activeState =
        controlledState === "sample" && submitted !== null ? submitted : controlledState;

    useEffect(() => {
        if (submitted !== "loading") return;
        const frame = requestAnimationFrame(() => setSubmitted("sample"));
        return () => cancelAnimationFrame(frame);
    }, [submitted]);

    const updateField = (field: keyof RequestForm, value: string) => {
        setForm((current) => ({ ...current, [field]: value }));
        if (field === "goal" && value.trim()) setGoalError(null);
    };

    return (
        <div className="flex flex-col gap-8">
            <header>
                <p className="text-label-caps text-(--ink-muted)">Diagnose</p>
                <h1 className="mt-2 text-h1 font-semibold text-foreground">Context Packet</h1>
                <p className="mt-2 max-w-2xl text-body text-(--ink-muted)">
                    Inspect a scoped, evidence-backed context packet before you begin work.
                </p>
            </header>
            <form
                className="rounded-(--radius-lg) border border-(--card-stroke) bg-(--card-80) p-6"
                noValidate
                onSubmit={(event) => {
                    event.preventDefault();
                    if (!form.goal.trim()) {
                        setGoalError("Goal is required.");
                        goalRef.current?.focus();
                        return;
                    }
                    setGoalError(null);
                    setPacket(projectPacket(form));
                    setSubmitted("loading");
                }}
            >
                <div className="grid gap-4 md:grid-cols-2">
                    <label htmlFor="context-goal" className="md:col-span-2">
                        <span className="text-sm font-medium text-foreground">
                            Goal <span className="text-(--ink-muted)">(required)</span>
                        </span>
                        <textarea
                            id="context-goal"
                            ref={goalRef}
                            required
                            aria-invalid={goalError !== null}
                            aria-describedby={goalError ? "context-goal-error" : undefined}
                            value={form.goal}
                            onChange={(event) => updateField("goal", event.target.value)}
                            className="mt-2 min-h-24 w-full rounded-(--radius-sm) border border-(--card-stroke) bg-background px-3 py-2 text-body text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50"
                        />
                        {goalError && (
                            <span
                                id="context-goal-error"
                                className="mt-1 block text-sm text-(--danger)"
                            >
                                {goalError}
                            </span>
                        )}
                    </label>
                    <label htmlFor="context-repository">
                        <span className="text-sm font-medium text-foreground">
                            Repository <span className="text-(--ink-muted)">(required)</span>
                        </span>
                        <select
                            id="context-repository"
                            required
                            value={form.repository}
                            onChange={(event) => updateField("repository", event.target.value)}
                            className="mt-2 w-full rounded-(--radius-sm) border border-(--card-stroke) bg-background px-3 py-2 text-body text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50"
                        >
                            {AUTHORIZED_REPOSITORIES.map((repository) => (
                                <option key={repository} value={repository}>
                                    {repository}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label htmlFor="context-branch-or-commit">
                        <span className="text-sm font-medium text-foreground">
                            Branch or commit
                        </span>
                        <input
                            id="context-branch-or-commit"
                            value={form.branchOrCommit}
                            onChange={(event) => updateField("branchOrCommit", event.target.value)}
                            className="mt-2 w-full rounded-(--radius-sm) border border-(--card-stroke) bg-background px-3 py-2 text-body text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50"
                        />
                    </label>
                    <label htmlFor="context-task-reference" className="md:col-span-2">
                        <span className="text-sm font-medium text-foreground">Task reference</span>
                        <input
                            id="context-task-reference"
                            value={form.taskReference}
                            onChange={(event) => updateField("taskReference", event.target.value)}
                            className="mt-2 w-full rounded-(--radius-sm) border border-(--card-stroke) bg-background px-3 py-2 text-body text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50"
                        />
                    </label>
                </div>
                <button
                    type="submit"
                    disabled={activeState === "loading"}
                    className="mt-5 rounded-(--radius-sm) bg-(--accent) px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50 disabled:cursor-wait disabled:opacity-60"
                >
                    {CTA_LABELS.generateContext}
                </button>
            </form>
            {submitted === "sample" && (
                <p role="status" className="sr-only">
                    Context packet ready.
                </p>
            )}
            <div>
                <ControlledState
                    state={activeState}
                    focusPacket={submitted === "sample"}
                    packet={packet}
                />
            </div>
        </div>
    );
}
