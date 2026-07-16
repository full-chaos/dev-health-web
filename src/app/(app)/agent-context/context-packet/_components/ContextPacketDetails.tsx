"use client";

import { useEffect, useRef } from "react";
import type { ACRContextPacketV1, ACRExpandedEvidenceV1 } from "@/lib/acr/generated";
import { ContextPacketCategoryGroups } from "./ContextPacketCategoryGroups";
import { ContextPacketDiagnostics } from "./ContextPacketDiagnostics";
import { ContextPacketFeedback } from "./ContextPacketFeedback";
import { displayPacketTime } from "./contextPacketFormatters";

type ContextPacketDetailsProps = {
    readonly packet: ACRContextPacketV1;
    readonly degraded?: boolean;
    readonly autoFocus?: boolean;
    readonly evidenceByID?: Readonly<Record<string, ACRExpandedEvidenceV1>>;
    readonly showRetrievalDebug?: boolean;
};

export function ContextPacketDetails({
    packet,
    degraded = false,
    autoFocus = false,
    evidenceByID = {},
    showRetrievalDebug = false,
}: ContextPacketDetailsProps) {
    const packetRef = useRef<HTMLElement>(null);

    useEffect(() => {
        if (autoFocus) packetRef.current?.focus();
    }, [autoFocus]);

    return (
        <section
            ref={packetRef}
            aria-label="Generated Context Fabric response"
            className="flex flex-col gap-6"
            tabIndex={-1}
        >
            {degraded ? <DegradedNotice /> : null}
            <PacketHeader packet={packet} showRetrievalDebug={showRetrievalDebug} />
            <ContextPacketCategoryGroups packet={packet} evidenceByID={evidenceByID} />
            <ContextPacketDiagnostics packet={packet} />
            <ContextPacketFeedback />
        </section>
    );
}

function DegradedNotice() {
    return (
        <div
            data-testid="data-state-degraded"
            className="rounded-(--radius-md) border border-(--caution) bg-(--caution)/10 p-4"
        >
            <p className="font-semibold text-foreground">Partial context is available</p>
            <p className="mt-1 text-sm text-(--ink-muted)">
                Some sources are unavailable, so verify the coverage details before acting.
            </p>
        </div>
    );
}

function PacketHeader({
    packet,
    showRetrievalDebug,
}: {
    readonly packet: ACRContextPacketV1;
    readonly showRetrievalDebug: boolean;
}) {
    const resolvedScope =
        packet.resolved_scope.commit_sha ?? packet.resolved_scope.branch ?? "Repository scope";

    return (
        <header className="rounded-(--radius-lg) border border-(--card-stroke) bg-(--card-80) p-6">
            <p className="text-label-caps text-(--ink-muted)">Context Fabric</p>
            <h2 className="mt-2 text-h2 font-semibold text-foreground">{packet.goal}</h2>
            <p className="mt-2 text-body text-(--ink-muted)">{packet.summary}</p>
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                <PacketMetadata label="Context Fabric status">{packet.status}</PacketMetadata>
                <PacketMetadata label="Repository">{packet.repository.slug}</PacketMetadata>
                <PacketMetadata label="Resolved scope">{resolvedScope}</PacketMetadata>
                <PacketMetadata label="Generated">
                    {displayPacketTime(packet.generated_at)}
                </PacketMetadata>
                <PacketMetadata label="Query version">{packet.query_version}</PacketMetadata>
                <PacketMetadata label="Ranking version">{packet.ranking_version}</PacketMetadata>
            </dl>
            {showRetrievalDebug && packet.retrieval_debug_summary ? (
                <details className="mt-4 text-sm text-(--ink-muted)">
                    <summary className="cursor-pointer font-medium text-foreground">
                        Retrieval details
                    </summary>
                    <p className="mt-2">{packet.retrieval_debug_summary}</p>
                </details>
            ) : null}
        </header>
    );
}

function PacketMetadata({
    label,
    children,
}: {
    readonly label: string;
    readonly children: string;
}) {
    return (
        <div>
            <dt className="text-(--ink-muted)">{label}</dt>
            <dd className="mt-1 font-medium text-foreground">{children}</dd>
        </div>
    );
}
