"use client";

import { useState } from "react";
import { CTA_LABELS } from "@/lib/design/cta";
import type {
    ACRContextPacketItemV1,
    ACRContextPacketV1,
    ACRExpandedEvidenceV1,
} from "@/lib/acr/generated";
import { displayPacketTime } from "./contextPacketFormatters";
import { isExpandedEvidence } from "./contextPacketResponse";
import { SafePacketMarkdown, safeExternalHref } from "./SafePacketMarkdown";

const CATEGORY_LABELS = [
    ["state", "State"],
    ["pressure", "Pressure"],
    ["cause", "Cause"],
    ["evidence", "Evidence"],
    ["action", "Action"],
] as const;
const MAX_CONCURRENT_EVIDENCE_REQUESTS = 8;

type EvidenceByID = Readonly<Record<string, ACRExpandedEvidenceV1>>;

type EvidenceLoadInput = {
    readonly evidenceRefIds: readonly string[];
    readonly repository: string;
};

async function loadEvidenceInBatches(input: EvidenceLoadInput): Promise<EvidenceByID> {
    const retrieved: Record<string, ACRExpandedEvidenceV1> = {};

    for (
        let offset = 0;
        offset < input.evidenceRefIds.length;
        offset += MAX_CONCURRENT_EVIDENCE_REQUESTS
    ) {
        const batch = input.evidenceRefIds.slice(offset, offset + MAX_CONCURRENT_EVIDENCE_REQUESTS);
        const results = await Promise.allSettled(
            batch.map(async (evidenceRefId) => {
                const response = await fetch(
                    `/api/agent-context/evidence/${encodeURIComponent(evidenceRefId)}?repository=${encodeURIComponent(input.repository)}`,
                    { cache: "no-store" },
                );
                const value: unknown = await response.json();
                return response.ok && isExpandedEvidence(value)
                    ? { evidence: value, evidenceRefId }
                    : null;
            }),
        );
        for (const result of results) {
            if (result.status === "fulfilled" && result.value !== null) {
                retrieved[result.value.evidenceRefId] = result.value.evidence;
            }
        }
    }

    return retrieved;
}

function CategoryItem({
    item,
    evidenceByID,
    repository,
}: {
    readonly item: ACRContextPacketItemV1;
    readonly evidenceByID: EvidenceByID;
    readonly repository: string;
}) {
    const [evidenceOpen, setEvidenceOpen] = useState(false);
    const [loadedEvidence, setLoadedEvidence] = useState<EvidenceByID>({});
    const [evidenceError, setEvidenceError] = useState<string | null>(null);
    const [loadingEvidence, setLoadingEvidence] = useState(false);
    const evidenceId = `evidence-${item.packet_item_id}`;
    const evidence = item.evidence_ref_ids
        .map((evidenceID) => loadedEvidence[evidenceID] ?? evidenceByID[evidenceID])
        .filter((value): value is ACRExpandedEvidenceV1 => value !== undefined);

    const requestEvidence = async () => {
        const missingEvidenceIDs = item.evidence_ref_ids.filter(
            (evidenceID) =>
                loadedEvidence[evidenceID] === undefined && evidenceByID[evidenceID] === undefined,
        );
        if (missingEvidenceIDs.length === 0) return;
        setLoadingEvidence(true);
        setEvidenceError(null);
        const retrieved = await loadEvidenceInBatches({
            evidenceRefIds: missingEvidenceIDs,
            repository,
        });
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
                <ul className="mt-3 flex flex-wrap gap-2 text-sm text-(--ink-muted)">
                    {item.related_entities.map((entity) => {
                        const href = safeExternalHref(entity.url);
                        return (
                            <li key={`${entity.type}-${entity.id}`}>
                                {href ? (
                                    <a
                                        href={href}
                                        rel="noreferrer"
                                        target="_blank"
                                        className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50"
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
            ) : null}
            {item.evidence_ref_ids.length > 0 ? (
                <div className="mt-4">
                    <button
                        type="button"
                        aria-controls={evidenceId}
                        aria-expanded={evidenceOpen}
                        onClick={() => {
                            const nextOpen = !evidenceOpen;
                            setEvidenceOpen(nextOpen);
                            if (nextOpen) void requestEvidence();
                        }}
                        className="rounded-(--radius-sm) border border-(--card-stroke) px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-(--card-70) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50"
                    >
                        {loadingEvidence ? "Loading evidence" : CTA_LABELS.openEvidence}
                    </button>
                    {evidenceOpen ? (
                        <div
                            id={evidenceId}
                            role="region"
                            aria-label={`Evidence for ${item.title}`}
                            className="mt-3 rounded-(--radius-sm) bg-background/60 p-3 text-sm text-(--ink-muted)"
                        >
                            {evidenceError ? <p role="status">{evidenceError}</p> : null}
                            {evidence.map((expanded) => (
                                <div key={expanded.evidence.evidence_ref_id} className="space-y-2">
                                    <p className="font-medium text-foreground">
                                        {expanded.evidence.source.display_label}
                                    </p>
                                    <SafePacketMarkdown>
                                        {expanded.evidence.citation}
                                    </SafePacketMarkdown>
                                    <p>
                                        Evidence is {expanded.availability}. Observed{" "}
                                        {displayPacketTime(expanded.evidence.observed_at)}.
                                    </p>
                                    {safeExternalHref(expanded.evidence.source.safe_uri) ? (
                                        <a
                                            href={safeExternalHref(
                                                expanded.evidence.source.safe_uri,
                                            )}
                                            rel="noreferrer"
                                            target="_blank"
                                            className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50"
                                        >
                                            {CTA_LABELS.viewSafeSource}
                                        </a>
                                    ) : null}
                                    {expanded.excerpt ? (
                                        <SafePacketMarkdown>{expanded.excerpt}</SafePacketMarkdown>
                                    ) : null}
                                    {expanded.redaction_reason ? (
                                        <p>Redaction: {expanded.redaction_reason}</p>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </article>
    );
}

export function ContextPacketCategoryGroups({
    packet,
    evidenceByID,
    repository = packet.repository.slug,
}: {
    readonly packet: ACRContextPacketV1;
    readonly evidenceByID: EvidenceByID;
    readonly repository?: string;
}) {
    const groupedItems = new Map(
        CATEGORY_LABELS.map(([category]) => [category, [] as ACRContextPacketItemV1[]]),
    );
    for (const item of packet.items) {
        groupedItems.get(item.category)?.push(item);
    }

    return (
        <div className="grid gap-4 xl:grid-cols-2">
            <div className="flex flex-col gap-4">
                {CATEGORY_LABELS.slice(0, 3).map(([category, label]) => (
                    <CategoryGroup
                        key={category}
                        label={label}
                        items={groupedItems.get(category) ?? []}
                        evidenceByID={evidenceByID}
                        repository={repository}
                    />
                ))}
            </div>
            <div className="flex flex-col gap-4">
                {CATEGORY_LABELS.slice(3).map(([category, label]) => (
                    <CategoryGroup
                        key={category}
                        label={label}
                        items={groupedItems.get(category) ?? []}
                        evidenceByID={evidenceByID}
                        repository={repository}
                    />
                ))}
            </div>
        </div>
    );
}

function CategoryGroup({
    label,
    items,
    evidenceByID,
    repository,
}: {
    readonly label: string;
    readonly items: readonly ACRContextPacketItemV1[];
    readonly evidenceByID: EvidenceByID;
    readonly repository: string;
}) {
    return (
        <section>
            <h2 className="text-h2 text-balance font-semibold text-foreground">{label}</h2>
            <div className="mt-3 flex flex-col gap-3">
                {items.length > 0 ? (
                    items.map((item) => (
                        <CategoryItem
                            key={item.packet_item_id}
                            item={item}
                            evidenceByID={evidenceByID}
                            repository={repository}
                        />
                    ))
                ) : (
                    <p className="rounded-(--radius-md) border border-dashed border-(--card-stroke) p-4 text-sm text-(--ink-muted)">
                        No {label.toLowerCase()} items were included.
                    </p>
                )}
            </div>
        </section>
    );
}
