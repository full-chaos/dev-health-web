"use client";

import { useState } from "react";
import { CTA_LABELS } from "@/lib/design/cta";
import type {
    ACRContextPacketItemV1,
    ACRContextPacketV1,
    ACRExpandedEvidenceV1,
} from "@/lib/acr/generated";
import { displayPacketTime } from "./contextPacketFormatters";

const CATEGORY_LABELS = [
    ["state", "State"],
    ["pressure", "Pressure"],
    ["cause", "Cause"],
    ["evidence", "Evidence"],
    ["action", "Action"],
] as const;

type EvidenceByID = Readonly<Record<string, ACRExpandedEvidenceV1>>;

function CategoryItem({
    item,
    evidenceByID,
}: {
    readonly item: ACRContextPacketItemV1;
    readonly evidenceByID: EvidenceByID;
}) {
    const [evidenceOpen, setEvidenceOpen] = useState(false);
    const evidenceId = `evidence-${item.packet_item_id}`;
    const evidence = item.evidence_ref_ids
        .map((evidenceID) => evidenceByID[evidenceID])
        .filter((value): value is ACRExpandedEvidenceV1 => value !== undefined);

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
            {evidence.length > 0 ? (
                <div className="mt-4">
                    <button
                        type="button"
                        aria-controls={evidenceId}
                        aria-expanded={evidenceOpen}
                        onClick={() => setEvidenceOpen((open) => !open)}
                        className="rounded-(--radius-sm) border border-(--card-stroke) px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-(--card-70) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50"
                    >
                        {CTA_LABELS.openEvidence}
                    </button>
                    {evidenceOpen ? (
                        <div
                            id={evidenceId}
                            role="region"
                            aria-label={`Evidence for ${item.title}`}
                            className="mt-3 rounded-(--radius-sm) bg-background/60 p-3 text-sm text-(--ink-muted)"
                        >
                            {evidence.map((expanded) => (
                                <div key={expanded.evidence.evidence_ref_id} className="space-y-2">
                                    <p className="font-medium text-foreground">
                                        {expanded.evidence.source.display_label}
                                    </p>
                                    <p>{expanded.evidence.citation}</p>
                                    <p>
                                        Evidence is {expanded.availability}. Observed{" "}
                                        {displayPacketTime(expanded.evidence.observed_at)}.
                                    </p>
                                    {expanded.evidence.source.safe_uri ? (
                                        <a
                                            href={expanded.evidence.source.safe_uri}
                                            className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50"
                                        >
                                            {CTA_LABELS.viewSafeSource}
                                        </a>
                                    ) : null}
                                    {expanded.excerpt ? <p>{expanded.excerpt}</p> : null}
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
}: {
    readonly packet: ACRContextPacketV1;
    readonly evidenceByID: EvidenceByID;
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
}: {
    readonly label: string;
    readonly items: readonly ACRContextPacketItemV1[];
    readonly evidenceByID: EvidenceByID;
}) {
    return (
        <section>
            <h2 className="text-h2 font-semibold text-foreground">{label}</h2>
            <div className="mt-3 flex flex-col gap-3">
                {items.length > 0 ? (
                    items.map((item) => (
                        <CategoryItem
                            key={item.packet_item_id}
                            item={item}
                            evidenceByID={evidenceByID}
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
