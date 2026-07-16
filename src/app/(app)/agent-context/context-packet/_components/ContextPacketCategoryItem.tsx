"use client";

import { useEffect, useRef, useState } from "react";
import type { ACRContextPacketItemV1, ACRExpandedEvidenceV1 } from "@/lib/acr/generated";
import { CTA_LABELS } from "@/lib/design/cta";
import type { EvidenceByID } from "./ContextPacketCategoryGroups";
import { displayPacketTime } from "./contextPacketFormatters";
import { requestEvidence } from "./evidenceRequestRegistry";
import { SafePacketMarkdown, safeExternalHref } from "./SafePacketMarkdown";

type CategoryItemProps = {
    readonly evidenceByID: EvidenceByID;
    readonly item: ACRContextPacketItemV1;
    readonly packetIdentity: string;
    readonly repository: string;
};

export function CategoryItem({
    evidenceByID,
    item,
    packetIdentity,
    repository,
}: CategoryItemProps) {
    const [evidenceOpen, setEvidenceOpen] = useState(false);
    const [loadedEvidence, setLoadedEvidence] = useState<EvidenceByID>({});
    const [evidenceError, setEvidenceError] = useState<string | null>(null);
    const [loadingEvidence, setLoadingEvidence] = useState(false);
    const requestGeneration = useRef(0);
    const packetIdentityRef = useRef(packetIdentity);
    const requestAbortController = useRef<AbortController | null>(null);
    const evidenceId = `evidence-${item.packet_item_id}`;
    const evidence = item.evidence_ref_ids
        .map((evidenceID) => loadedEvidence[evidenceID] ?? evidenceByID[evidenceID])
        .filter((value): value is ACRExpandedEvidenceV1 => value !== undefined);

    useEffect(() => {
        packetIdentityRef.current = packetIdentity;
        return () => {
            requestGeneration.current += 1;
            requestAbortController.current?.abort();
        };
    }, [packetIdentity]);

    const loadMissingEvidence = async () => {
        const missingEvidenceIDs = item.evidence_ref_ids.filter(
            (evidenceID) =>
                loadedEvidence[evidenceID] === undefined && evidenceByID[evidenceID] === undefined,
        );
        if (missingEvidenceIDs.length === 0) return;

        const generation = requestGeneration.current + 1;
        requestGeneration.current = generation;
        requestAbortController.current?.abort();
        const controller = new AbortController();
        requestAbortController.current = controller;
        setLoadingEvidence(true);
        setEvidenceError(null);
        const leases = missingEvidenceIDs.map((evidenceRefId) => ({
            evidenceRefId,
            lease: requestEvidence(repository, evidenceRefId, controller.signal),
        }));
        const values = await Promise.all(
            leases.map(async ({ evidenceRefId, lease }) => ({
                evidenceRefId,
                evidence: await lease.promise,
            })),
        );
        for (const { lease } of leases) lease.release();
        if (
            generation !== requestGeneration.current ||
            packetIdentityRef.current !== packetIdentity
        )
            return;

        const retrieved = Object.fromEntries(
            values.flatMap(({ evidenceRefId, evidence }) =>
                evidence ? [[evidenceRefId, evidence]] : [],
            ),
        );
        if (Object.keys(retrieved).length > 0) {
            setLoadedEvidence((current) => ({ ...current, ...retrieved }));
        }
        if (Object.keys(retrieved).length !== missingEvidenceIDs.length) {
            setEvidenceError(
                "Some evidence is unavailable. Open evidence again to retry missing references.",
            );
        }
        setLoadingEvidence(false);
    };

    return (
        <article className="rounded-(--radius-md) border border-(--card-stroke) bg-(--card-80) p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-label-caps text-(--ink-muted)">{item.claim_kind}</p>
                    <h3 className="mt-1 text-h3 font-semibold text-foreground">{item.title}</h3>
                </div>
                <p className="text-xs text-(--ink-muted)">
                    {item.severity} · {Math.round(item.confidence * 100)}% confidence
                </p>
            </div>
            <p className="mt-3 text-body text-(--ink-muted)">{item.summary}</p>
            <p className="mt-3 border-l-2 border-(--accent) pl-3 text-sm text-foreground">
                <span className="font-semibold">Why included: </span>
                {item.why_included}
            </p>
            {item.related_entities.length > 0 ? (
                <RelatedEntities entities={item.related_entities} />
            ) : null}
            {item.evidence_ref_ids.length > 0 ? (
                <EvidenceDisclosure
                    evidence={evidence}
                    evidenceError={evidenceError}
                    evidenceId={evidenceId}
                    evidenceOpen={evidenceOpen}
                    itemTitle={item.title}
                    loadingEvidence={loadingEvidence}
                    onToggle={() => {
                        const nextOpen = !evidenceOpen;
                        setEvidenceOpen(nextOpen);
                        if (nextOpen) void loadMissingEvidence();
                    }}
                />
            ) : null}
        </article>
    );
}

function RelatedEntities({
    entities,
}: {
    readonly entities: ACRContextPacketItemV1["related_entities"];
}) {
    return (
        <ul className="mt-3 flex flex-wrap gap-2 text-sm text-(--ink-muted)">
            {entities.map((entity) => {
                const href = safeExternalHref(entity.url);
                return (
                    <li key={`${entity.type}-${entity.id}`}>
                        {href ? (
                            <a
                                className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50"
                                href={href}
                                rel="noreferrer"
                                target="_blank"
                            >
                                {entity.label}
                            </a>
                        ) : (
                            entity.label
                        )}
                    </li>
                );
            })}
        </ul>
    );
}

function EvidenceDisclosure({
    evidence,
    evidenceError,
    evidenceId,
    evidenceOpen,
    itemTitle,
    loadingEvidence,
    onToggle,
}: {
    readonly evidence: readonly ACRExpandedEvidenceV1[];
    readonly evidenceError: string | null;
    readonly evidenceId: string;
    readonly evidenceOpen: boolean;
    readonly itemTitle: string;
    readonly loadingEvidence: boolean;
    readonly onToggle: () => void;
}) {
    return (
        <div className="mt-4">
            <button
                aria-controls={evidenceId}
                aria-expanded={evidenceOpen}
                className="rounded-(--radius-sm) border border-(--card-stroke) px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-(--card-70) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50"
                onClick={onToggle}
                type="button"
            >
                {loadingEvidence ? "Loading evidence" : CTA_LABELS.openEvidence}
            </button>
            {evidenceOpen ? (
                <div
                    aria-label={`Evidence for ${itemTitle}`}
                    className="mt-3 rounded-(--radius-sm) bg-background/60 p-3 text-sm text-(--ink-muted)"
                    id={evidenceId}
                    role="region"
                >
                    {evidenceError ? <p role="status">{evidenceError}</p> : null}
                    {evidence.map((expanded) => (
                        <ExpandedEvidence
                            expanded={expanded}
                            key={expanded.evidence.evidence_ref_id}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function ExpandedEvidence({ expanded }: { readonly expanded: ACRExpandedEvidenceV1 }) {
    const sourceHref = safeExternalHref(expanded.evidence.source.safe_uri);
    return (
        <div className="space-y-2">
            <p className="font-medium text-foreground">{expanded.evidence.source.display_label}</p>
            <SafePacketMarkdown>{expanded.evidence.citation}</SafePacketMarkdown>
            <p>
                Evidence is {expanded.availability}. Observed{" "}
                {displayPacketTime(expanded.evidence.observed_at)}.
            </p>
            {sourceHref ? (
                <a
                    className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50"
                    href={sourceHref}
                    rel="noreferrer"
                    target="_blank"
                >
                    {CTA_LABELS.viewSafeSource}
                </a>
            ) : null}
            {expanded.excerpt ? <SafePacketMarkdown>{expanded.excerpt}</SafePacketMarkdown> : null}
            {expanded.redaction_reason ? <p>Redaction: {expanded.redaction_reason}</p> : null}
        </div>
    );
}
