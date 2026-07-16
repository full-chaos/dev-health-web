"use client";

import { useEffect, useRef } from "react";
import { DataState } from "@/components/ui/DataState";
import type { ACRContextPacketV1, ACRExpandedEvidenceV1 } from "@/lib/acr/generated";
import { ContextPacketDetails } from "./ContextPacketDetails";
import type { ControlledPacketState } from "./contextPacketStates";
import {
    SAMPLE_DEGRADED_CONTEXT_PACKET,
    SAMPLE_EXPANDED_EVIDENCE,
    SAMPLE_PARTIAL_CONTEXT_PACKET,
} from "./samplePacket";

type ContextPacketTerminalStateProps = {
    readonly autoFocus: boolean;
    readonly packet: ACRContextPacketV1;
    readonly sampleMode: boolean;
    readonly showRetrievalDebug: boolean;
    readonly state: ControlledPacketState;
};

const terminalMessages: Record<ControlledPacketState, string> = {
    complete: "Context Fabric response complete.",
    degraded: "Context Fabric response degraded.",
    empty: "No Context Fabric response matched this scope.",
    error: "Context Fabric response could not be generated.",
    loading: "Preparing Context Fabric response.",
    "not-entitled": "Agent Context Runtime is not available for this organization.",
    partial: "Context Fabric response is partial.",
    sample: "Context Fabric response ready.",
};

function FocusedState({
    autoFocus,
    children,
    message,
}: {
    readonly autoFocus: boolean;
    readonly children: React.ReactNode;
    readonly message: string;
}) {
    const stateRef = useRef<HTMLElement>(null);

    useEffect(() => {
        if (autoFocus) stateRef.current?.focus();
    }, [autoFocus]);

    return (
        <section ref={stateRef} aria-live="polite" role="status" tabIndex={-1}>
            <p className="sr-only">{message}</p>
            {children}
        </section>
    );
}

function packetFor(
    state: ControlledPacketState,
    packet: ACRContextPacketV1,
    sampleMode: boolean,
): {
    readonly evidenceByID: Readonly<Record<string, ACRExpandedEvidenceV1>>;
    readonly packet: ACRContextPacketV1;
} {
    if (!sampleMode) return { evidenceByID: {}, packet };
    switch (state) {
        case "degraded":
            return {
                evidenceByID: SAMPLE_EXPANDED_EVIDENCE,
                packet: SAMPLE_DEGRADED_CONTEXT_PACKET,
            };
        case "partial":
            return {
                evidenceByID: SAMPLE_EXPANDED_EVIDENCE,
                packet: SAMPLE_PARTIAL_CONTEXT_PACKET,
            };
        case "sample":
            return { evidenceByID: SAMPLE_EXPANDED_EVIDENCE, packet };
        default:
            return { evidenceByID: {}, packet };
    }
}

export function ContextPacketTerminalState({
    autoFocus,
    packet,
    sampleMode,
    showRetrievalDebug,
    state,
}: ContextPacketTerminalStateProps) {
    if (state === "loading") {
        return (
            <DataState
                variant="loading"
                title="Preparing Context Fabric response"
                className="min-h-24"
            />
        );
    }

    if (state === "empty") {
        return (
            <FocusedState autoFocus={autoFocus} message={terminalMessages[state]}>
                <DataState
                    variant="detector-enabled-no-findings"
                    title="No context matched this scope"
                    description="Refine the goal or scope and try again."
                    data-testid="data-state-empty"
                />
            </FocusedState>
        );
    }

    if (state === "error") {
        return (
            <FocusedState autoFocus={autoFocus} message={terminalMessages[state]}>
                <DataState
                    variant="error"
                    title="Context Fabric response could not be generated"
                    message="Try again when the service is available."
                    data-testid="data-state-error"
                />
            </FocusedState>
        );
    }

    if (state === "not-entitled") {
        return (
            <FocusedState autoFocus={autoFocus} message={terminalMessages[state]}>
                <DataState
                    variant="no-data-connected"
                    title="Agent Context Runtime is not available for this organization"
                    description="Ask an organization administrator to review product access."
                    data-testid="data-state-not-entitled"
                />
            </FocusedState>
        );
    }

    const display = packetFor(state, packet, sampleMode);
    return (
        <FocusedState autoFocus={autoFocus} message={terminalMessages[state]}>
            <ContextPacketDetails
                packet={display.packet}
                degraded={state === "degraded"}
                autoFocus={false}
                evidenceByID={display.evidenceByID}
                showRetrievalDebug={showRetrievalDebug}
            />
        </FocusedState>
    );
}
