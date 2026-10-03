"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AuditLogFilters } from "@/components/shared/AuditLogFilters";
import { listAuditLogs } from "@/lib/admin/server";
import type { AuditLog, AuditLogFilter } from "@/lib/admin/types";
import { UpgradeGate } from "@/components/billing/UpgradeGate";
import { Button } from "@/components/shared/Button";
import { AdminPager } from "@/components/admin/AdminPager";
import { DataState } from "@/components/ui/DataState";
import { Notice } from "@/components/ui/Notice";
import { Section } from "@/components/ui/Section";
import { CTA_LABELS } from "@/lib/design/cta";
import { logger } from "@/lib/logger";
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
                // The backend text goes to the log, never to the page (one plain sentence + Retry).
                logger.error({ err: apiError }, "Failed to load audit logs");
                setError(apiError);
            } else if (data) {
                setLogs(data.items);
            }
        } catch (err) {
            logger.error({ err }, "Failed to load audit logs");
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
            <div className="space-y-6">
                <AdminHeader
                    title="Organization"
                    description="Browse and filter audit events for your organization."
                />

                <Section title="Audit events">
                    <AuditLogFilters
                        key={filterResetKey}
                        variant="admin"
                        framed={false}
                        onFilter={handleFilter}
                    />

                    {error && (
                        <Notice
                            variant="danger"
                            live={false}
                            action={<Button onClick={fetchLogs}>{CTA_LABELS.retry}</Button>}
                        >
                            Audit logs could not be loaded. Retry, or check again in a moment.
                        </Notice>
                    )}

                    {loading ? (
                        <DataState variant="loading" title="Loading audit logs..." />
                    ) : error ? null : logs.length === 0 ? (
                        <AuditLogEmptyState
                            hasActiveFilters={hasActiveFilters}
                            onResetAction={handleResetFilters}
                        />
                    ) : (
                        <>
                            <AuditLogRows entries={logs} onRowSelectAction={handleRowSelect} />
                            <AdminPager
                                offset={offset}
                                count={logs.length}
                                hasNext={logs.length >= limit}
                                onPreviousAction={handlePrevPage}
                                onNextAction={handleNextPage}
                            />
                        </>
                    )}
                </Section>

                <AuditLogDetailDrawer
                    entry={selectedEntry}
                    isOpen={isDrawerOpen}
                    onCloseAction={handleCloseDrawer}
                />
            </div>
        </UpgradeGate>
    );
}
