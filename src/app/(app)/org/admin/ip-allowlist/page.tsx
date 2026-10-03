"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";

import { AdminErrorNotice, isValidationStatus } from "@/components/admin/AdminErrorNotice";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminPager } from "@/components/admin/AdminPager";
import { Button } from "@/components/shared/Button";
import { DataState } from "@/components/ui/DataState";
import { Section } from "@/components/ui/Section";
import { logger } from "@/lib/logger";
import {
    listIPAllowlistEntries,
    createIPAllowlistEntry,
    updateIPAllowlistEntry,
    deleteIPAllowlistEntry,
    getCurrentClientIp,
} from "@/lib/admin/server";
import type { IPAllowlist, IPAllowlistCreate, IPAllowlistUpdate } from "@/lib/admin/types";
import { UpgradeGate } from "@/components/billing/UpgradeGate";
import { CTA_LABELS } from "@/lib/design/cta";
import { IpAllowlistForm } from "./IpAllowlistForm";
import { IpAllowlistTable } from "./IpAllowlistTable";

type FormState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; entry: IPAllowlist };

function formatDate(d: string | null): string {
    if (!d) return "--";
    return new Date(d).toLocaleDateString();
}

export default function IPAllowlistPage() {
    const [entries, setEntries] = useState<IPAllowlist[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [errorKind, setErrorKind] = useState<"load" | "action">("load");
    const [errorStatus, setErrorStatus] = useState<number | undefined>(undefined);
    const [errorServed, setErrorServed] = useState(false);

    // An action failure: the served text shows only for a validation answer (or an embedded
    // action-level answer); a 5xx or a network failure is one plain sentence and the text is logged.
    const reportActionError = (message: string, status?: number, served = false) => {
        if (!served && !isValidationStatus(status)) {
            logger.error({ err: message, status }, "Admin action failed");
        }
        setErrorKind("action");
        setErrorStatus(status);
        setErrorServed(served);
        setError(message);
    };
    const [offset, setOffset] = useState(0);
    const limit = 50;

    const [formState, setFormState] = useState<FormState>({ mode: "closed" });
    const [saving, setSaving] = useState(false);
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [currentIp, setCurrentIp] = useState<string | null>(null);

    const fetchEntries = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: apiError } = await listIPAllowlistEntries(limit, offset);
            if (apiError) {
                // The backend text goes to the log; the page says one plain sentence + Retry.
                logger.error({ err: apiError }, "Failed to load ip allowlist entries");
                setErrorKind("load");
                setErrorStatus(undefined);
                setErrorServed(false);
                setError(apiError);
            } else if (data) {
                setEntries(data.items);
            }
        } catch (err) {
            logger.error({ err }, "Failed to load ip allowlist entries");
            setErrorKind("load");
            setErrorStatus(undefined);
            setErrorServed(false);
            setError("An unexpected error occurred");
        } finally {
            setLoading(false);
        }
    }, [offset]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchEntries coordinates async loading state after mount/page changes.
        fetchEntries();
    }, [fetchEntries]);

    useEffect(() => {
        getCurrentClientIp().then(({ data }) => {
            if (data) setCurrentIp(data);
        });
    }, []);

    const handleSave = async (data: IPAllowlistCreate | IPAllowlistUpdate) => {
        setSaving(true);
        const result =
            formState.mode === "edit"
                ? await updateIPAllowlistEntry(formState.entry.id, data)
                : await createIPAllowlistEntry(data as IPAllowlistCreate);
        setSaving(false);
        if (result.error) {
            reportActionError(result.error, result.status);
        } else {
            setFormState({ mode: "closed" });
            fetchEntries();
        }
    };

    const handleToggle = async (entry: IPAllowlist) => {
        setTogglingId(entry.id);
        const res = await updateIPAllowlistEntry(entry.id, {
            is_active: !entry.is_active,
        });
        setTogglingId(null);
        if (res.error) {
            reportActionError(res.error, res.status);
        } else {
            fetchEntries();
        }
    };

    const handleDelete = async (entry: IPAllowlist) => {
        const res = await deleteIPAllowlistEntry(entry.id);
        if (res.error) {
            reportActionError(res.error, res.status);
        } else {
            fetchEntries();
        }
    };

    return (
        <UpgradeGate feature="ip_allowlist" requiredTier="enterprise">
            <div className="space-y-6">
                <AdminHeader
                    title="Organization"
                    description="Manage allowed IP addresses and CIDR ranges for your organization."
                >
                    {formState.mode === "closed" ? (
                        <Button
                            variant="primary"
                            onClick={() => setFormState({ mode: "create" })}
                            icon={<Plus className="h-4 w-4" />}
                        >
                            {CTA_LABELS.addIpAllowlistEntry}
                        </Button>
                    ) : null}
                </AdminHeader>

                {error && (
                    <AdminErrorNotice
                        error={error}
                        kind={errorKind}
                        status={errorStatus}
                        served={errorServed}
                        subject="IP allowlist entries"
                        onRetryAction={fetchEntries}
                    />
                )}

                {formState.mode !== "closed" ? (
                    <IpAllowlistForm
                        mode={formState.mode}
                        initialEntry={formState.mode === "edit" ? formState.entry : undefined}
                        currentIp={currentIp}
                        isSaving={saving}
                        onSaveAction={handleSave}
                        onCancelAction={() => setFormState({ mode: "closed" })}
                    />
                ) : null}

                <Section title="IP Allowlist">
                    {loading ? (
                        <DataState variant="loading" title="Loading IP allowlist..." />
                    ) : (
                        <>
                            <IpAllowlistTable
                                entries={entries}
                                currentIp={currentIp}
                                togglingId={togglingId}
                                onEditAction={(entry) => setFormState({ mode: "edit", entry })}
                                onToggleAction={handleToggle}
                                onDeleteAction={handleDelete}
                                formatDate={formatDate}
                            />

                            {entries.length > 0 || offset > 0 ? (
                                <AdminPager
                                    offset={offset}
                                    count={entries.length}
                                    hasNext={entries.length >= limit}
                                    onPreviousAction={() =>
                                        setOffset((prev) => Math.max(0, prev - limit))
                                    }
                                    onNextAction={() => setOffset((prev) => prev + limit)}
                                />
                            ) : null}
                        </>
                    )}
                </Section>
            </div>
        </UpgradeGate>
    );
}
