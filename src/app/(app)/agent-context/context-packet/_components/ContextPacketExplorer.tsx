"use client";

import { useEffect, useRef, useState } from "react";
import type { ACRContextPacketV1 } from "@/lib/acr/generated";
import { CTA_LABELS } from "@/lib/design/cta";
import type { ControlledPacketState } from "./contextPacketStates";
import { ContextPacketTerminalState } from "./ContextPacketTerminalState";
import { projectContextPacket, type ContextPacketRequestForm } from "./contextPacketProjection";
import { isContextPacket } from "./contextPacketResponse";
import { RepositoryDiscoveryState } from "./RepositoryDiscoveryState";
import {
    parseRepositoryCatalog,
    repositoryCatalogFrom,
    type RepositoryCatalog,
} from "./repositoryCatalog";
import { SAMPLE_CONTEXT_PACKET } from "./samplePacket";

export type { ControlledPacketState } from "./contextPacketStates";

type ContextPacketExplorerProps = {
    readonly controlledState: ControlledPacketState;
    readonly live?: boolean;
    readonly repositories?: readonly string[];
    readonly repositoryCatalog?: RepositoryCatalog;
    readonly showRetrievalDebug?: boolean;
};

const SAMPLE_REQUEST: ContextPacketRequestForm = {
    goal: SAMPLE_CONTEXT_PACKET.goal,
    repository: SAMPLE_CONTEXT_PACKET.repository.slug,
    branchOrCommit: SAMPLE_CONTEXT_PACKET.resolved_scope.commit_sha ?? "",
    taskReference: SAMPLE_CONTEXT_PACKET.requested_scope.task_ref ?? "",
};

function initialRequest(live: boolean, repositories: readonly string[]): ContextPacketRequestForm {
    if (!live) return SAMPLE_REQUEST;
    return { branchOrCommit: "", goal: "", repository: repositories[0] ?? "", taskReference: "" };
}

function packetState(packet: ACRContextPacketV1): ControlledPacketState {
    return packet.status === "complete" ? "complete" : packet.status;
}

function isTerminalState(state: ControlledPacketState): boolean {
    return state !== "loading";
}

export function ContextPacketExplorer({
    controlledState,
    live = false,
    repositories = live ? [] : [SAMPLE_CONTEXT_PACKET.repository.slug],
    repositoryCatalog,
    showRetrievalDebug = false,
}: ContextPacketExplorerProps) {
    const initialRepositoryCatalog = repositoryCatalog ?? repositoryCatalogFrom(repositories);
    const [catalog, setCatalog] = useState(initialRepositoryCatalog);
    const [isRetryingCatalog, setIsRetryingCatalog] = useState(false);
    const availableRepositories = catalog.kind === "ready" ? catalog.repositories : [];
    const [form, setForm] = useState(() => initialRequest(live, availableRepositories));
    const [submitted, setSubmitted] = useState<ControlledPacketState | null>(null);
    const [goalError, setGoalError] = useState<string | null>(null);
    const [packet, setPacket] = useState<ACRContextPacketV1 | null>(() =>
        live ? null : SAMPLE_CONTEXT_PACKET,
    );
    const goalRef = useRef<HTMLTextAreaElement>(null);
    const liveRequestGeneration = useRef(0);
    const activeState =
        controlledState === "sample" && submitted !== null ? submitted : controlledState;

    useEffect(() => {
        if (live || submitted !== "loading") return;
        const frame = requestAnimationFrame(() => setSubmitted("sample"));
        return () => cancelAnimationFrame(frame);
    }, [live, submitted]);

    useEffect(() => {
        return () => {
            liveRequestGeneration.current += 1;
        };
    }, []);

    const updateField = (field: keyof ContextPacketRequestForm, value: string) => {
        setForm((current) => ({ ...current, [field]: value }));
        if (field === "goal" && value.trim()) setGoalError(null);
    };

    const submitContext = async () => {
        if (!form.goal.trim()) {
            setGoalError("Goal is required.");
            goalRef.current?.focus();
            return;
        }
        setGoalError(null);
        if (live && catalog.kind !== "ready") return;
        if (!live) {
            setPacket(projectContextPacket(form));
            setSubmitted("loading");
            return;
        }
        const requestGeneration = liveRequestGeneration.current + 1;
        liveRequestGeneration.current = requestGeneration;
        setSubmitted("loading");
        try {
            const response = await fetch("/api/agent-context/context-packets", {
                body: JSON.stringify({
                    branchOrCommit: form.branchOrCommit || undefined,
                    goal: form.goal,
                    repository: form.repository,
                    taskReference: form.taskReference || undefined,
                }),
                cache: "no-store",
                headers: { "Content-Type": "application/json" },
                method: "POST",
            });
            const payload: unknown = await response.json();
            if (requestGeneration !== liveRequestGeneration.current) return;
            if (!response.ok || !isContextPacket(payload)) {
                setSubmitted(response.status === 403 ? "not-entitled" : "error");
                return;
            }
            setPacket(payload);
            setSubmitted(packetState(payload));
        } catch {
            if (requestGeneration === liveRequestGeneration.current) setSubmitted("error");
        }
    };

    const retryRepositoryDiscovery = async () => {
        setIsRetryingCatalog(true);
        try {
            const response = await fetch("/api/agent-context/repositories", {
                cache: "no-store",
                method: "GET",
            });
            const payload: unknown = await response.json();
            const nextCatalog: RepositoryCatalog = response.ok
                ? parseRepositoryCatalog(payload)
                : { kind: "error" };
            setCatalog(nextCatalog);
            if (nextCatalog.kind === "ready") {
                setForm((current) => ({
                    ...current,
                    repository: nextCatalog.repositories[0] ?? "",
                }));
            }
        } catch {
            setCatalog({ kind: "error" });
        } finally {
            setIsRetryingCatalog(false);
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <header>
                <p className="text-label-caps text-(--ink-muted)">Diagnose</p>
                <h1 className="mt-2 text-h1 font-semibold text-foreground">Context Fabric</h1>
                <p className="mt-2 max-w-2xl text-body text-(--ink-muted)">
                    Inspect a scoped, evidence-backed Context Fabric response before you begin work.
                </p>
            </header>
            <form
                className="rounded-(--radius-lg) border border-(--card-stroke) bg-(--card-80) p-6"
                noValidate
                onSubmit={(event) => {
                    event.preventDefault();
                    void submitContext();
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
                        {goalError ? (
                            <span
                                id="context-goal-error"
                                className="mt-1 block text-sm text-(--negative)"
                            >
                                {goalError}
                            </span>
                        ) : null}
                    </label>
                    <label htmlFor="context-repository">
                        <span className="text-sm font-medium text-foreground">
                            Repository <span className="text-(--ink-muted)">(required)</span>
                        </span>
                        <select
                            id="context-repository"
                            required
                            disabled={catalog.kind !== "ready"}
                            value={form.repository}
                            onChange={(event) => updateField("repository", event.target.value)}
                            className="mt-2 w-full rounded-(--radius-sm) border border-(--card-stroke) bg-background px-3 py-2 text-body text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50"
                        >
                            {availableRepositories.map((repository) => (
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
                    <RepositoryDiscoveryState
                        catalog={catalog}
                        isRetrying={isRetryingCatalog}
                        onRetry={() => void retryRepositoryDiscovery()}
                    />
                </div>
                <button
                    type="submit"
                    disabled={catalog.kind !== "ready"}
                    className="mt-5 rounded-(--radius-sm) bg-(--accent) px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50 disabled:cursor-wait disabled:opacity-60"
                >
                    {CTA_LABELS.generateContext}
                </button>
            </form>
            <ContextPacketTerminalState
                autoFocus={
                    isTerminalState(activeState) &&
                    (submitted !== null || controlledState !== "sample")
                }
                packet={packet}
                sampleMode={!live}
                showRetrievalDebug={showRetrievalDebug}
                state={activeState}
            />
        </div>
    );
}
