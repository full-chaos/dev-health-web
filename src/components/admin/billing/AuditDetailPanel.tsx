"use client";

import { useState } from "react";

import type { BillingAuditEntry } from "@/app/(app)/superadmin/billing/audit/actions";

type AuditDetailPanelProps = {
  entry: BillingAuditEntry | null;
  onResolveAction: (resolution: string) => Promise<void>;
};

function formatStateValue(value: unknown): string {
  if (value === undefined) {
    return "-";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function StateDiff({
  local,
  stripe,
}: {
  local: Record<string, unknown> | null;
  stripe: Record<string, unknown> | null;
}) {
  const localObj = local ?? {};
  const stripeObj = stripe ?? {};
  const allKeys = [...new Set([...Object.keys(localObj), ...Object.keys(stripeObj)])].sort();

  if (allKeys.length === 0) {
    return <p className="text-sm text-(--ink-muted)">No state data available.</p>;
  }

  return (
    <div className="overflow-auto rounded-xl border border-(--card-stroke) bg-(--card-70)">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-(--card-stroke)">
            <th className="p-2 font-medium">Field</th>
            <th className="p-2 font-medium">Local</th>
            <th className="p-2 font-medium">Stripe</th>
          </tr>
        </thead>
        <tbody>
          {allKeys.map((key) => {
            const localValue = localObj[key];
            const stripeValue = stripeObj[key];
            const localText = formatStateValue(localValue);
            const stripeText = formatStateValue(stripeValue);
            const matches = JSON.stringify(localValue) === JSON.stringify(stripeValue);

            return (
              <tr
                key={key}
                className={`border-b border-(--card-stroke)/60 ${matches ? "" : "bg-(--accent)/10"}`}
              >
                <td className="p-2 font-medium">{key}</td>
                <td className={`p-2 ${matches ? "text-(--ink-muted)" : "text-red-300"}`}>
                  {localText}
                </td>
                <td className={`p-2 ${matches ? "text-(--ink-muted)" : "text-green-300"}`}>
                  {stripeText}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AuditDetailPanel({ entry, onResolveAction }: AuditDetailPanelProps) {
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
      <StateDiff local={entry.local_state} stripe={entry.stripe_state} />
      <form
        className="flex gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!resolution) {
            return;
          }
          setIsSaving(true);
          await onResolveAction(resolution);
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
