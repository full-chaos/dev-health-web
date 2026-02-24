"use client";

import { useState } from "react";

type Filters = {
  resource_type?: string;
  action?: string;
  reconciliation_status?: string;
  from_date?: string;
  to_date?: string;
};

type AuditLogFiltersProps = {
  onApply: (filters: Filters) => void;
};

export function AuditLogFilters({ onApply }: AuditLogFiltersProps) {
  const [resourceType, setResourceType] = useState("");
  const [action, setAction] = useState("");
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  return (
    <form
      className="grid gap-3 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-4 md:grid-cols-5"
      onSubmit={(event) => {
        event.preventDefault();
        onApply({
          resource_type: resourceType || undefined,
          action: action || undefined,
          reconciliation_status: status || undefined,
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
        });
      }}
    >
      <input
        value={resourceType}
        onChange={(event) => setResourceType(event.target.value)}
        placeholder="resource type"
        className="rounded-xl border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm"
      />
      <input
        value={action}
        onChange={(event) => setAction(event.target.value)}
        placeholder="action"
        className="rounded-xl border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm"
      />
      <select
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        className="rounded-xl border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm"
      >
        <option value="">any status</option>
        <option value="matched">matched</option>
        <option value="mismatch">mismatch</option>
        <option value="unresolved">unresolved</option>
      </select>
      <input
        type="date"
        value={fromDate}
        onChange={(event) => setFromDate(event.target.value)}
        className="rounded-xl border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <input
          type="date"
          value={toDate}
          onChange={(event) => setToDate(event.target.value)}
          className="w-full rounded-xl border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-xl bg-(--accent) px-4 py-2 text-sm font-medium text-white"
        >
          Apply
        </button>
      </div>
    </form>
  );
}
