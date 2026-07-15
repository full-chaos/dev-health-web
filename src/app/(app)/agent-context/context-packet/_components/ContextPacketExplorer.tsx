"use client";

import { useState } from "react";
import { DataState } from "@/components/ui/DataState";
import { CTA_LABELS } from "@/lib/design/cta";
import { ContextPacketDetails } from "./ContextPacketDetails";
import type { ControlledPacketState } from "./contextPacketStates";
import { SAMPLE_CONTEXT_PACKET } from "./samplePacket";

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

function ControlledState({ state }: { readonly state: ControlledPacketState }) {
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
                    packet={{ ...SAMPLE_CONTEXT_PACKET, status: "degraded" }}
                    degraded
                />
            );
        case "sample":
            return <ContextPacketDetails packet={SAMPLE_CONTEXT_PACKET} />;
    }
}

export function ContextPacketExplorer({ controlledState }: ContextPacketExplorerProps) {
    const [form, setForm] = useState(SAMPLE_REQUEST);
    const [submitted, setSubmitted] = useState<ControlledPacketState | null>(null);
    const activeState =
        controlledState === "sample" && submitted !== null ? submitted : controlledState;

    const updateField = (field: keyof RequestForm, value: string) =>
        setForm((current) => ({ ...current, [field]: value }));

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
                onSubmit={(event) => {
                    event.preventDefault();
                    setSubmitted("loading");
                }}
            >
                <div className="grid gap-4 md:grid-cols-2">
                    <label htmlFor="context-goal" className="md:col-span-2">
                        <span className="text-sm font-medium text-foreground">
                            Goal <span aria-hidden="true">*</span>
                        </span>
                        <textarea
                            id="context-goal"
                            required
                            value={form.goal}
                            onChange={(event) => updateField("goal", event.target.value)}
                            className="mt-2 min-h-24 w-full rounded-(--radius-sm) border border-(--card-stroke) bg-background px-3 py-2 text-body text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50"
                        />
                    </label>
                    <label htmlFor="context-repository">
                        <span className="text-sm font-medium text-foreground">
                            Repository <span aria-hidden="true">*</span>
                        </span>
                        <input
                            id="context-repository"
                            required
                            value={form.repository}
                            onChange={(event) => updateField("repository", event.target.value)}
                            className="mt-2 w-full rounded-(--radius-sm) border border-(--card-stroke) bg-background px-3 py-2 text-body text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50"
                        />
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
            <div aria-live="polite">
                <ControlledState state={activeState} />
            </div>
        </div>
    );
}
