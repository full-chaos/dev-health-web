"use client";

import { ArrowRight } from "lucide-react";
import { ClientTimestamp } from "@/components/ClientTimestamp";
import { buttonClassName } from "@/components/shared/Button";
import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import { EvidenceFact, EvidenceFactList } from "@/components/evidence/EvidenceFacts";
import { Section } from "@/components/ui/Section";
import { READ_FAILED_MESSAGE } from "@/lib/readFailure";
import { CTA_LABELS } from "@/lib/design/cta";
import { datasetAttentionRows, type DatasetAttention } from "@/lib/admin/syncAttention";
import type { IntegrationDataset } from "@/lib/admin/types";
import { CoverageBadge } from "./CoverageBadge";

interface SyncNeedsAttentionProps {
    datasets: readonly IntegrationDataset[];
    /** True when the dataset read failed; the section then says so instead of showing nothing. */
    failed?: boolean;
}

function datasetTitle(key: string): string {
    return key.replace(/[_-]+/g, " ");
}

function AttentionEvidence({ row }: { row: DatasetAttention }) {
    return (
        <div className="space-y-4" data-testid="sync-attention-evidence">
            <p className="text-sm">{row.reason}</p>
            <EvidenceFactList aria-label="Dataset state">
                <EvidenceFact label="Dataset" value={datasetTitle(row.datasetKey)} />
                <EvidenceFact label="State" value={row.label} />
                <EvidenceFact
                    label="Failing since"
                    value={
                        row.since ? (
                            <ClientTimestamp value={row.since} fallback="Unknown" />
                        ) : undefined
                    }
                />
                <EvidenceFact
                    label="Last failure"
                    value={
                        row.lastSeenAt ? (
                            <ClientTimestamp value={row.lastSeenAt} fallback="Unknown" />
                        ) : undefined
                    }
                />
            </EvidenceFactList>
            <p className="text-xs text-(--ink-muted)">{row.detail}</p>
        </div>
    );
}

function AttentionRow({ row }: { row: DatasetAttention }) {
    const evidence = useEvidenceDrawer();
    const title = datasetTitle(row.datasetKey);
    return (
        <li
            className="flex flex-wrap items-center justify-between gap-3 py-3"
            data-testid="sync-attention-row"
        >
            <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium capitalize">{title}</span>
                    <CoverageBadge tone="caution" label={row.label} />
                </div>
                <p className="text-sm text-(--ink-muted)">{row.reason}</p>
                <p className="text-xs text-(--ink-muted)">
                    {row.since ? (
                        <ClientTimestamp value={row.since} prefix="Since " fallback="" />
                    ) : null}
                    {row.since && row.lastSeenAt ? " · " : null}
                    {row.lastSeenAt ? (
                        <ClientTimestamp
                            value={row.lastSeenAt}
                            prefix="Last failure "
                            fallback=""
                        />
                    ) : null}
                </p>
            </div>
            <button
                type="button"
                data-testid="sync-attention-evidence-open"
                aria-label={`${CTA_LABELS.openEvidence}: ${title}`}
                onClick={() => evidence.open({ title, content: <AttentionEvidence row={row} /> })}
                className={buttonClassName("ghost", "sm")}
            >
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
                {CTA_LABELS.openEvidence}
            </button>
        </li>
    );
}

export function SyncNeedsAttention({ datasets, failed = false }: SyncNeedsAttentionProps) {
    const rows = datasetAttentionRows(datasets);
    if (!failed && rows.length === 0) return null;
    return (
        <Section
            title="Needs attention"
            description="Datasets that keep failing the same way."
            data-testid="sync-needs-attention"
        >
            {failed ? (
                <p className="mt-3 text-sm text-(--ink-muted)" role="status">
                    {READ_FAILED_MESSAGE}
                </p>
            ) : (
                <ul className="mt-2 divide-y divide-(--card-stroke)">
                    {rows.map((row) => (
                        <AttentionRow key={row.datasetKey} row={row} />
                    ))}
                </ul>
            )}
        </Section>
    );
}
