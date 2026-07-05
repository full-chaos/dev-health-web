"use client";

import type { ReactNode } from "react";
import type { AuditLog } from "@/lib/admin/types";
import { formatDateTimeUTC } from "@/lib/formatters";
import { CTA_LABELS } from "@/lib/design/cta";
import { AuditIdentityLabel } from "./AuditIdentityLabel";
import { AuditStatusBadge } from "./AuditStatusBadge";
import { CopyIdButton } from "./CopyIdButton";
import { PayloadFieldList } from "./PayloadFieldList";

type AuditLogDetailDrawerProps = {
    entry: AuditLog | null;
    isOpen: boolean;
    onCloseAction: () => void;
};

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex gap-3 text-sm">
            <span className="w-28 shrink-0 pt-0.5 text-xs uppercase tracking-wide text-(--ink-muted)">
                {label}
            </span>
            <div className="min-w-0 flex-1">{children}</div>
        </div>
    );
}

/**
 * Row detail surface for the org audit-logs investigation page (CHAOS-2843).
 * A drawer, not a new route — modeled on {@link EvidencePanel}'s slide-over
 * pattern. Every field the audit-log API returns is shown as a typed,
 * labeled row; payload/context objects render through {@link PayloadFieldList}
 * instead of a raw JSON dump.
 */
export function AuditLogDetailDrawer({ entry, isOpen, onCloseAction }: AuditLogDetailDrawerProps) {
    if (!isOpen || !entry) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end" data-testid="audit-log-detail-drawer">
            <button
                type="button"
                aria-label={CTA_LABELS.closePanel}
                className="absolute inset-0 bg-black/50"
                onClick={onCloseAction}
            />
            <div className="relative z-10 flex h-full w-full flex-col rounded-l-3xl border-l border-(--card-stroke) bg-card shadow-2xl md:max-w-lg">
                <header className="flex items-center justify-between border-b border-(--card-stroke) bg-(--card-90) p-6">
                    <div>
                        <p className="text-xs uppercase tracking-widest text-(--ink-muted)">
                            Audit event
                        </p>
                        <h2 className="mt-1 font-mono text-lg font-semibold text-foreground">
                            {entry.action}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onCloseAction}
                        title={CTA_LABELS.closePanel}
                        className="rounded-full border border-(--card-stroke) p-2 text-xs uppercase tracking-widest text-(--ink-muted) transition-colors hover:bg-(--card-70) hover:text-foreground"
                    >
                        ✕
                    </button>
                </header>

                <div className="flex-1 space-y-4 overflow-y-auto p-6">
                    <DetailRow label="Timestamp">{formatDateTimeUTC(entry.created_at)}</DetailRow>
                    <DetailRow label="Status">
                        <AuditStatusBadge status={entry.status} />
                    </DetailRow>
                    <DetailRow label="Actor">
                        <AuditIdentityLabel
                            id={entry.user_id}
                            emptyLabel="System"
                            copyLabel="actor ID"
                            layout="inline"
                        />
                    </DetailRow>
                    <DetailRow label="Resource">
                        <div className="space-y-1">
                            <span className="text-xs uppercase tracking-wide text-(--ink-muted)">
                                {entry.resource_type}
                            </span>
                            <AuditIdentityLabel
                                id={entry.resource_id}
                                emptyLabel="—"
                                copyLabel="resource ID"
                                layout="inline"
                            />
                        </div>
                    </DetailRow>
                    {entry.description && (
                        <DetailRow label="Description">{entry.description}</DetailRow>
                    )}
                    {entry.error_message && (
                        <DetailRow label="Error">
                            <span className="text-(--negative)">{entry.error_message}</span>
                        </DetailRow>
                    )}
                    <DetailRow label="Entry ID">
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-(--ink-muted)">{entry.id}</span>
                            <CopyIdButton value={entry.id} label="audit entry ID" />
                        </div>
                    </DetailRow>

                    <PayloadFieldList
                        title="Change payload"
                        data={entry.changes}
                        emptyMessage="No change payload was returned for this event."
                    />
                    <PayloadFieldList
                        title="Request context"
                        data={entry.request_metadata}
                        emptyMessage="No request context was returned for this event."
                    />
                </div>
            </div>
        </div>
    );
}
