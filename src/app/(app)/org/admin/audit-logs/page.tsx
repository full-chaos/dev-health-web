"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AuditLogFilters } from "@/components/shared/AuditLogFilters";
import { listAuditLogs } from "@/lib/admin/server";
import type { AuditLog, AuditLogFilter } from "@/lib/admin/types";
import { UpgradeGate } from "@/components/billing/UpgradeGate";
import { CTA_LABELS } from "@/lib/design/cta";
import { AuditLogRows } from "./AuditLogRows";
import { AuditLogDetailDrawer } from "./AuditLogDetailDrawer";
import { AuditLogEmptyState } from "./AuditLogEmptyState";

export default function OrgAuditLogPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState<AuditLogFilter>({});
    const [offset, setOffset] = useState(0);
    const [selectedEntry, setSelectedEntry] = useState<AuditLog | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    // Remounts AuditLogFilters (via `key`) so a reset triggered from OUTSIDE
    // the filter form — the empty-state action — also clears its inputs;
    // the form's own Reset button already clears them directly.
    const [filterResetKey, setFilterResetKey] = useState(0);
    const limit = 50;

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: apiError } = await listAuditLogs(filters, limit, offset);
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

    const hasActiveFilters = useMemo(
        () => Object.values(filters).some((value) => Boolean(value)),
        [filters],
    );

    const handleFilter = (newFilters: AuditLogFilter) => {
        setFilters(newFilters);
        setOffset(0);
    };

    const handleResetFilters = () => {
        setFilters({});
        setOffset(0);
        setFilterResetKey((key) => key + 1);
    };

    const handleNextPage = () => {
        setOffset((prev) => prev + limit);
    };

    const handlePrevPage = () => {
        setOffset((prev) => Math.max(0, prev - limit));
    };

    const handleRowSelect = (entry: AuditLog) => {
        setSelectedEntry(entry);
        setIsDrawerOpen(true);
    };

    const handleCloseDrawer = () => {
        setIsDrawerOpen(false);
    };

    return (
        <UpgradeGate feature="audit_log" requiredTier="enterprise">
            <div>
                <AdminHeader
                    title="Audit Logs"
                    description="Browse and filter audit events for your organization."
                />

                <AuditLogFilters key={filterResetKey} variant="admin" onFilter={handleFilter} />

                {error && (
                    <div className="mb-6 rounded-2xl border border-(--negative)/20 bg-(--negative)/10 p-4 text-(--negative)">
                        Error loading audit logs: {error}
                    </div>
                )}

                {loading ? (
                    <div className="py-12 text-center text-(--ink-muted)">
                        Loading audit logs...
                    </div>
                ) : error ? null : logs.length === 0 ? (
                    <AuditLogEmptyState
                        hasActiveFilters={hasActiveFilters}
                        onResetAction={handleResetFilters}
                    />
                ) : (
                    <>
                        <AuditLogRows entries={logs} onRowSelectAction={handleRowSelect} />
                        <div className="mt-4 flex items-center justify-between">
                            <button
                                type="button"
                                onClick={handlePrevPage}
                                disabled={offset === 0}
                                className="rounded-lg border border-(--card-stroke) bg-(--card-80) px-4 py-2 text-sm font-medium disabled:opacity-50"
                            >
                                {CTA_LABELS.previousPage}
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
                                {CTA_LABELS.nextPage}
                            </button>
                        </div>
                    </>
                )}

                <AuditLogDetailDrawer
                    entry={selectedEntry}
                    isOpen={isDrawerOpen}
                    onCloseAction={handleCloseDrawer}
                />
            </div>
        </UpgradeGate>
    );
}
