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
import { AuditLogFilters } from "@/components/admin/billing/AuditLogFilters";
import { AuditLogTable } from "@/components/admin/billing/AuditLogTable";
import { AuditDetailPanel } from "@/components/admin/billing/AuditDetailPanel";
import { ReconciliationTrigger } from "@/components/admin/billing/ReconciliationTrigger";

type AuditClientPageProps = {
  initialEntries: BillingAuditEntry[];
};

export function AuditClientPage({ initialEntries }: AuditClientPageProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [selectedEntry, setSelectedEntry] = useState<BillingAuditEntry | null>(null);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<ReconciliationReport | null>(null);

  const refresh = async (filters?: BillingAuditFilters) => {
    const result = await getAuditLog(filters);
    if (result.error || !result.data) {
      toast.error(result.error);
      return;
    }
    setEntries(result.data.items);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Billing Audit</h1>
      <AuditLogFilters onApply={(filters) => void refresh(filters)} />
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
        entries={entries}
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
        onResolve={async (resolution) => {
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
