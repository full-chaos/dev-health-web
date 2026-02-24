"use client";

import { useState } from "react";

import type { BillingAuditEntry } from "@/app/(app)/admin/billing/audit/actions";

type AuditDetailPanelProps = {
  entry: BillingAuditEntry | null;
  onResolve: (resolution: string) => Promise<void>;
};

export function AuditDetailPanel({ entry, onResolve }: AuditDetailPanelProps) {
  const [resolution, setResolution] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  if (!entry) {
    return (
      <div className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-4 text-sm text-(--ink-muted)">
        Select an audit entry to inspect local vs Stripe state.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-4">
      <p className="text-sm font-medium">{entry.description}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <pre className="overflow-auto rounded-xl bg-(--card-70) p-3 text-xs">
          {JSON.stringify(entry.local_state ?? {}, null, 2)}
        </pre>
        <pre className="overflow-auto rounded-xl bg-(--card-70) p-3 text-xs">
          {JSON.stringify(entry.stripe_state ?? {}, null, 2)}
        </pre>
      </div>
      <form
        className="flex gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!resolution) {
            return;
          }
          setIsSaving(true);
          await onResolve(resolution);
          setIsSaving(false);
          setResolution("");
        }}
      >
        <input
          value={resolution}
          onChange={(event) => setResolution(event.target.value)}
          placeholder="resolution details"
          className="w-full rounded-xl border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-xl bg-(--accent) px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Resolve
        </button>
      </form>
    </div>
  );
}
