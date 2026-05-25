"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AuditLogTable } from "@/components/shared/AuditLogTable";
import { AuditLogFilters } from "@/components/shared/AuditLogFilters";
import { listPlatformAuditLogs } from "@/lib/admin/server";
import type { AuditLog, AuditLogFilter } from "@/lib/admin/types";

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<AuditLogFilter>({});
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: apiError } = await listPlatformAuditLogs(filters, limit, offset);
      if (apiError) {
        setError(apiError);
      } else if (data) {
        setLogs(data.items);
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }, [filters, offset]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchLogs coordinates async loading state after mount/filter changes.
    fetchLogs();
  }, [fetchLogs]);

  const handleFilter = (newFilters: AuditLogFilter) => {
    setFilters(newFilters);
    setOffset(0);
  };

  const handleNextPage = () => {
    setOffset((prev) => prev + limit);
  };

  const handlePrevPage = () => {
    setOffset((prev) => Math.max(0, prev - limit));
  };

  return (
    <div>
      <AdminHeader
        title="Platform Audit Log"
        description="View and filter system-wide audit events."
      />

      <AuditLogFilters variant="admin" onFilter={handleFilter} />

      {error && (
        <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-500">
          Error loading audit logs: {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-(--ink-muted)">Loading audit logs...</div>
      ) : (
        <>
          <AuditLogTable variant="admin" entries={logs} />
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={offset === 0}
              className="rounded-lg border border-(--card-stroke) bg-(--card-80) px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-(--ink-muted)">
              Showing {offset + 1}-{offset + logs.length}
            </span>
            <button
              type="button"
              onClick={handleNextPage}
              disabled={logs.length < limit}
              className="rounded-lg border border-(--card-stroke) bg-(--card-80) px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
