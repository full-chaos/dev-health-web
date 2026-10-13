"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
    getAuditEntry,
    getAuditLog,
    resolveAuditMismatch,
    triggerReconciliation,
    type BillingAuditEntry,
    type BillingAuditFilters,
    type ReconciliationReport,
} from "./actions";
import { AuditLogFilters } from "@/components/shared/AuditLogFilters";
import { AuditLogTable } from "@/components/shared/AuditLogTable";
import { AuditDetailPanel } from "@/components/admin/billing/AuditDetailPanel";
import { ReconciliationTrigger } from "@/components/admin/billing/ReconciliationTrigger";

type AuditClientPageProps = {
    initialEntries: BillingAuditEntry[];
    initialError?: string | null;
};

const EMPTY_MESSAGE = "No billing audit entries for this organization and filter.";

export function AuditClientPage({ initialEntries, initialError = null }: AuditClientPageProps) {
    const [loadError, setLoadError] = useState<string | null>(initialError);
    const [loading, setLoading] = useState(false);
    const [entries, setEntries] = useState(initialEntries);
    const [selectedEntry, setSelectedEntry] = useState<BillingAuditEntry | null>(null);
    const [running, setRunning] = useState(false);
    const [report, setReport] = useState<ReconciliationReport | null>(null);

    const refresh = async (filters?: BillingAuditFilters) => {
        setLoading(true);
        const result = await getAuditLog(filters);
        setLoading(false);
        if (result.error || !result.data) {
            setLoadError(result.error ?? "Could not be read");
            toast.error(result.error);
            return;
        }
        setLoadError(null);
        setEntries(result.data.items);
    };

    return (
        <div className="space-y-4">
            <AuditLogFilters variant="billing" onApply={(filters) => void refresh(filters)} />
            <ReconciliationTrigger
                running={running}
                report={report}
                onRun={async () => {
                    setRunning(true);
                    const result = await triggerReconciliation();
                    setRunning(false);
                    if (result.error) {
                        toast.error(result.error);
                        return;
                    }
                    if (!result.data) {
                        toast.error("No reconciliation report returned");
                        return;
                    }
                    setReport(result.data);
                    await refresh();
                }}
            />
            <AuditLogTable
                variant="billing"
                entries={entries}
                emptyMessage={loading ? undefined : (loadError ?? EMPTY_MESSAGE)}
                onSelect={async (entryId) => {
                    const result = await getAuditEntry(entryId);
                    if (result.error) {
                        toast.error(result.error);
                        return;
                    }
                    if (!result.data) {
                        toast.error("No audit entry returned");
                        return;
                    }
                    setSelectedEntry(result.data);
                }}
            />
            <AuditDetailPanel
                entry={selectedEntry}
                onResolveAction={async (resolution) => {
                    if (!selectedEntry) {
                        return;
                    }
                    const result = await resolveAuditMismatch(selectedEntry.id, resolution);
                    if (result.error) {
                        toast.error(result.error);
                        return;
                    }
                    if (!result.data) {
                        toast.error("No updated audit entry returned");
                        return;
                    }
                    setSelectedEntry(result.data);
                    await refresh();
                }}
            />
        </div>
    );
}
