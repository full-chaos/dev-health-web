"use client";

import type { ReconciliationReport } from "@/app/(app)/superadmin/billing/audit/actions";

type ReconciliationTriggerProps = {
    running: boolean;
    report: ReconciliationReport | null;
    onRun: () => Promise<void>;
};

export function ReconciliationTrigger({ running, report, onRun }: ReconciliationTriggerProps) {
    return (
        <div className="rounded-2xl border border-(--border) bg-(--card-80) p-4">
            <button
                type="button"
                onClick={() => void onRun()}
                disabled={running}
                className="rounded-xl bg-(--accent) px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
                {running ? "Reconciliation in progress..." : "Run Reconciliation"}
            </button>
            {report ? (
                <div className="mt-3 grid gap-2 text-xs text-(--ink-muted) md:grid-cols-3">
                    <p>Subscriptions: {report.subscriptions_checked}</p>
                    <p>Invoices: {report.invoices_checked}</p>
                    <p>Refunds: {report.refunds_checked}</p>
                    <p>Mismatches: {report.mismatches.length}</p>
                    <p>Missing Local: {report.missing_local.length}</p>
                    <p>Missing Stripe: {report.missing_stripe.length}</p>
                </div>
            ) : null}
        </div>
    );
}
