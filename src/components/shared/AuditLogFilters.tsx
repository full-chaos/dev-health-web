"use client";

/**
 * Unified AuditLogFilters — configurable for both admin (org-level) and
 * billing (superadmin) audit log filter variants.
 *
 * Replaces:
 *   - src/components/superadmin/AuditLogFilters.tsx   (variant="admin")
 *   - src/components/admin/billing/AuditLogFilters.tsx (variant="billing")
 *
 * Differences handled by variant:
 *   - "admin":   onFilter callback, fields: action / resource_type / start_date / end_date
 *   - "billing": onApply callback, fields: action / resource_type / reconciliation_status / from_date / to_date
 */

import { useState } from "react";

// ============================================================================
// Shared filter shapes
// ============================================================================

export type AdminAuditFilter = {
  action?: string;
  resource_type?: string;
  start_date?: string;
  end_date?: string;
};

export type BillingAuditFilter = {
  resource_type?: string;
  action?: string;
  reconciliation_status?: string;
  from_date?: string;
  to_date?: string;
};

// ============================================================================
// Variant: admin — labelled inputs, full-width button
// ============================================================================

function AdminAuditLogFilters({ onFilter }: { onFilter: (f: AdminAuditFilter) => void }) {
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onFilter({
          action: action || undefined,
          resource_type: resourceType || undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        });
      }}
      className="mb-6 grid gap-4 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-4 sm:grid-cols-2 lg:grid-cols-5"
    >
      <div>
        <label htmlFor="audit-action-filter" className="mb-1 block text-xs font-medium text-(--ink-muted)">
          Action
        </label>
        <input
          id="audit-action-filter"
          type="text"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="e.g. org.create"
          className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm focus:border-(--accent) focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="audit-resource-filter" className="mb-1 block text-xs font-medium text-(--ink-muted)">
          Resource Type
        </label>
        <input
          id="audit-resource-filter"
          type="text"
          value={resourceType}
          onChange={(e) => setResourceType(e.target.value)}
          placeholder="e.g. organization"
          className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm focus:border-(--accent) focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="audit-start-date" className="mb-1 block text-xs font-medium text-(--ink-muted)">
          Start Date
        </label>
        <input
          id="audit-start-date"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm focus:border-(--accent) focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="audit-end-date" className="mb-1 block text-xs font-medium text-(--ink-muted)">
          End Date
        </label>
        <input
          id="audit-end-date"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm focus:border-(--accent) focus:outline-none"
        />
      </div>
      <div className="flex items-end">
        <button
          type="submit"
          className="w-full rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90"
        >
          Search
        </button>
      </div>
    </form>
  );
}

// ============================================================================
// Variant: billing — compact inline inputs with reconciliation status select
// ============================================================================

function BillingAuditLogFilters({ onApply }: { onApply: (f: BillingAuditFilter) => void }) {
  const [resourceType, setResourceType] = useState("");
  const [action, setAction] = useState("");
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  return (
    <form
      className="grid gap-3 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-4 md:grid-cols-5"
      onSubmit={(e) => {
        e.preventDefault();
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
        onChange={(e) => setResourceType(e.target.value)}
        placeholder="resource type"
        className="rounded-xl border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm"
      />
      <input
        value={action}
        onChange={(e) => setAction(e.target.value)}
        placeholder="action"
        className="rounded-xl border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm"
      />
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
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
        onChange={(e) => setFromDate(e.target.value)}
        className="rounded-xl border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
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

// ============================================================================
// Public API — single configurable component
// ============================================================================

type AuditLogFiltersProps =
  | {
      variant: "admin";
      onFilter: (filters: AdminAuditFilter) => void;
      onApply?: never;
    }
  | {
      variant: "billing";
      onApply: (filters: BillingAuditFilter) => void;
      onFilter?: never;
    };

export function AuditLogFilters({ variant, onFilter, onApply }: AuditLogFiltersProps) {
  if (variant === "billing") {
    return <BillingAuditLogFilters onApply={onApply} />;
  }
  return <AdminAuditLogFilters onFilter={onFilter} />;
}
