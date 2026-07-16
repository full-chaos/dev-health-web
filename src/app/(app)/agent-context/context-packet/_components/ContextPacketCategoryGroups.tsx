"use client";

import type {
    ACRContextPacketItemV1,
    ACRContextPacketV1,
    ACRExpandedEvidenceV1,
} from "@/lib/acr/generated";
import { CategoryItem } from "./ContextPacketCategoryItem";

const CATEGORY_LABELS = [
    ["state", "State"],
    ["pressure", "Pressure"],
    ["cause", "Cause"],
    ["evidence", "Evidence"],
    ["action", "Action"],
] as const;

export type EvidenceByID = Readonly<Record<string, ACRExpandedEvidenceV1>>;

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
                        evidenceByID={evidenceByID}
                        items={groupedItems.get(category) ?? []}
                        label={label}
                        packetIdentity={packet.context_packet_id}
                        repository={repository}
                    />
                ))}
            </div>
            <div className="flex flex-col gap-4">
                {CATEGORY_LABELS.slice(3).map(([category, label]) => (
                    <CategoryGroup
                        key={category}
                        evidenceByID={evidenceByID}
                        items={groupedItems.get(category) ?? []}
                        label={label}
                        packetIdentity={packet.context_packet_id}
                        repository={repository}
                    />
                ))}
            </div>
        </div>
    );
}

function CategoryGroup({
    evidenceByID,
    items,
    label,
    packetIdentity,
    repository,
}: {
    readonly evidenceByID: EvidenceByID;
    readonly items: readonly ACRContextPacketItemV1[];
    readonly label: string;
    readonly packetIdentity: string;
    readonly repository: string;
}) {
    return (
        <section>
            <h2 className="text-h2 text-balance font-semibold text-foreground">{label}</h2>
            <div className="mt-3 flex flex-col gap-3">
                {items.length > 0 ? (
                    items.map((item) => (
                        <CategoryItem
                            key={`${packetIdentity}:${item.packet_item_id}`}
                            evidenceByID={evidenceByID}
                            item={item}
                            packetIdentity={packetIdentity}
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
