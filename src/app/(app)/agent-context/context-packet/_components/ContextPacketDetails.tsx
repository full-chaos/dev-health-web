"use client";

import { useEffect, useRef, useState } from "react";
import { CTA_LABELS } from "@/lib/design/cta";
import type {
    ACRContextPacketItemV1,
    ACRContextPacketV1,
    ACRExpandedEvidenceV1,
} from "@/lib/acr/generated";

const CATEGORY_LABELS = [
    ["state", "State"],
    ["pressure", "Pressure"],
    ["cause", "Cause"],
    ["evidence", "Evidence"],
    ["action", "Action"],
] as const;

type ContextPacketDetailsProps = {
    readonly packet: ACRContextPacketV1;
    readonly degraded?: boolean;
    readonly autoFocus?: boolean;
    readonly evidenceByID?: Readonly<Record<string, ACRExpandedEvidenceV1>>;
};

function displayTime(value: string) {
    return new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
    }).format(new Date(value));
}

function displayNumber(value: number) {
    return new Intl.NumberFormat("en-US").format(value);
}

function CategoryItem({
    item,
    evidenceByID,
}: {
    readonly item: ACRContextPacketItemV1;
    readonly evidenceByID: Readonly<Record<string, ACRExpandedEvidenceV1>>;
}) {
    const [evidenceOpen, setEvidenceOpen] = useState(false);
    const evidenceId = `evidence-${item.packet_item_id}`;
    const evidence = item.evidence_ref_ids
        .map((evidenceID) => evidenceByID[evidenceID])
        .filter((value): value is ACRExpandedEvidenceV1 => value !== undefined);
    const hasEvidence = evidence.length > 0;

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
            {hasEvidence && (
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
                    {evidenceOpen && (
                        <div
                            id={evidenceId}
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
                                        {displayTime(expanded.evidence.observed_at)}.
                                    </p>
                                    {expanded.evidence.source.safe_uri && (
                                        <a
                                            href={expanded.evidence.source.safe_uri}
                                            className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50"
                                        >
                                            {CTA_LABELS.viewSafeSource}
                                        </a>
                                    )}
                                    {expanded.excerpt && <p>{expanded.excerpt}</p>}
                                    {expanded.redaction_reason && (
                                        <p>Redaction: {expanded.redaction_reason}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </article>
    );
}

export function ContextPacketDetails({
    packet,
    degraded = false,
    autoFocus = false,
    evidenceByID = {},
}: ContextPacketDetailsProps) {
    const packetRef = useRef<HTMLElement>(null);

    useEffect(() => {
        if (autoFocus) packetRef.current?.focus();
    }, [autoFocus]);

    return (
        <section
            ref={packetRef}
            aria-label="Generated context packet"
            className="flex flex-col gap-6"
            tabIndex={-1}
        >
            {degraded && (
                <div
                    data-testid="data-state-degraded"
                    className="rounded-(--radius-md) border border-(--caution) bg-(--caution)/10 p-4"
                >
                    <p className="font-semibold text-foreground">Partial context is available</p>
                    <p className="mt-1 text-sm text-(--ink-muted)">
                        Some sources are unavailable, so verify the coverage details before acting.
                    </p>
                </div>
            )}
            <header className="rounded-(--radius-lg) border border-(--card-stroke) bg-(--card-80) p-6">
                <p className="text-label-caps text-(--ink-muted)">Context Packet</p>
                <h2 className="mt-2 text-h2 font-semibold text-foreground">{packet.goal}</h2>
                <p className="mt-2 text-body text-(--ink-muted)">{packet.summary}</p>
                <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                    <div>
                        <dt className="text-(--ink-muted)">Packet status</dt>
                        <dd className="mt-1 font-medium text-foreground">{packet.status}</dd>
                    </div>
                    <div>
                        <dt className="text-(--ink-muted)">Repository</dt>
                        <dd className="mt-1 font-medium text-foreground">
                            {packet.repository.slug}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-(--ink-muted)">Resolved scope</dt>
                        <dd className="mt-1 font-medium text-foreground">
                            {packet.resolved_scope.commit_sha ??
                                packet.resolved_scope.branch ??
                                "Repository scope"}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-(--ink-muted)">Generated</dt>
                        <dd className="mt-1 font-medium text-foreground">
                            {displayTime(packet.generated_at)}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-(--ink-muted)">Query version</dt>
                        <dd className="mt-1 font-medium text-foreground">{packet.query_version}</dd>
                    </div>
                    <div>
                        <dt className="text-(--ink-muted)">Ranking version</dt>
                        <dd className="mt-1 font-medium text-foreground">
                            {packet.ranking_version}
                        </dd>
                    </div>
                </dl>
            </header>
            <div className="grid gap-4 xl:grid-cols-2">
                {CATEGORY_LABELS.map(([category, label]) => {
                    const items = packet.items.filter((item) => item.category === category);
                    return (
                        <section
                            key={category}
                            className={
                                category === "evidence" || category === "action"
                                    ? "xl:col-span-2"
                                    : undefined
                            }
                        >
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
                })}
            </div>
            <section
                className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4"
                aria-label="Packet diagnostics"
            >
                <div className="rounded-(--radius-md) border border-(--card-stroke) bg-(--card-80) p-4">
                    <h2 className="text-h3 font-semibold">Freshness</h2>
                    <p className="mt-2 text-sm text-(--ink-muted)">
                        As of {displayTime(packet.freshness.as_of)}. Refresh after{" "}
                        {Math.round(packet.freshness.stale_after_seconds / 3600)} hours.
                    </p>
                    <ul className="mt-2 text-sm text-(--ink-muted)">
                        {packet.freshness.watermarks.map((watermark) => (
                            <li key={watermark.source}>
                                {watermark.source}: {watermark.status}
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="rounded-(--radius-md) border border-(--card-stroke) bg-(--card-80) p-4">
                    <h2 className="text-h3 font-semibold">Coverage</h2>
                    <p className="mt-2 text-sm text-(--ink-muted)">
                        {packet.coverage.sources_available.length} of{" "}
                        {packet.coverage.sources_considered.length} sources available.
                    </p>
                    {packet.coverage.sources_unavailable.length > 0 && (
                        <ul className="mt-2 text-sm text-(--ink-muted)">
                            {packet.coverage.sources_unavailable.map((source) => (
                                <li key={source.source}>
                                    {source.source}: {source.reason}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="rounded-(--radius-md) border border-(--card-stroke) bg-(--card-80) p-4">
                    <h2 className="text-h3 font-semibold">Budget</h2>
                    <p className="mt-2 text-sm text-(--ink-muted)">
                        {packet.budget.items_used} of {packet.budget.max_items} items used ·{" "}
                        {packet.budget.estimated_tokens} estimated tokens.
                    </p>
                    <p className="mt-2 text-sm text-(--ink-muted)">
                        {displayNumber(packet.budget.serialized_bytes)} serialized bytes ·{" "}
                        {packet.budget.truncated ? "output truncated" : "output complete"}
                    </p>
                </div>
                <div className="rounded-(--radius-md) border border-(--card-stroke) bg-(--card-80) p-4">
                    <h2 className="text-h3 font-semibold">Checks and next steps</h2>
                    <p className="mt-2 text-sm text-(--ink-muted)">
                        {packet.required_checks.length} required check and{" "}
                        {packet.recommended_next_steps.length} recommended next step.
                    </p>
                    <ul className="mt-2 text-sm text-(--ink-muted)">
                        {packet.required_checks.map((check) => (
                            <li key={check.check_id}>{check.label}</li>
                        ))}
                    </ul>
                    <ul className="mt-2 text-sm text-(--ink-muted)">
                        {packet.recommended_next_steps.map((step) => (
                            <li key={step.step_id}>{step.label}</li>
                        ))}
                    </ul>
                </div>
            </section>
        </section>
    );
}
