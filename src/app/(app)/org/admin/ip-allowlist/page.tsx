"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
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
                setError(apiError);
            } else if (data) {
                setEntries(data.items);
            }
        } catch {
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
            setError(result.error);
        } else {
            setFormState({ mode: "closed" });
            fetchEntries();
        }
    };

    const handleToggle = async (entry: IPAllowlist) => {
        setTogglingId(entry.id);
        const { error: apiError } = await updateIPAllowlistEntry(entry.id, {
            is_active: !entry.is_active,
        });
        setTogglingId(null);
        if (apiError) {
            setError(apiError);
        } else {
            fetchEntries();
        }
    };

    const handleDelete = async (entry: IPAllowlist) => {
        const { error: apiError } = await deleteIPAllowlistEntry(entry.id);
        if (apiError) {
            setError(apiError);
        } else {
            fetchEntries();
        }
    };

    return (
        <UpgradeGate feature="ip_allowlist" requiredTier="enterprise">
            <div>
                <AdminHeader
                    title="IP Allowlist"
                    description="Manage allowed IP addresses and CIDR ranges for your organization."
                />

                {error && (
                    <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-500">
                        {error}
                    </div>
                )}

                <div className="mb-6">
                    {formState.mode !== "closed" ? (
                        <IpAllowlistForm
                            mode={formState.mode}
                            initialEntry={formState.mode === "edit" ? formState.entry : undefined}
                            currentIp={currentIp}
                            isSaving={saving}
                            onSaveAction={handleSave}
                            onCancelAction={() => setFormState({ mode: "closed" })}
                        />
                    ) : (
                        <button
                            type="button"
                            onClick={() => setFormState({ mode: "create" })}
                            className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white"
                        >
                            {CTA_LABELS.addIpAllowlistEntry}
                        </button>
                    )}
                </div>

                {loading ? (
                    <div className="py-12 text-center text-(--ink-muted)">
                        Loading IP allowlist...
                    </div>
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

                        <div className="mt-4 flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
                                disabled={offset === 0}
                                className="rounded-lg border border-(--card-stroke) bg-(--card-80) px-4 py-2 text-sm font-medium disabled:opacity-50"
                            >
                                {CTA_LABELS.previousPage}
                            </button>
                            <span className="text-sm text-(--ink-muted)">
                                Showing {offset + 1}-{offset + entries.length}
                            </span>
                            <button
                                type="button"
                                onClick={() => setOffset((prev) => prev + limit)}
                                disabled={entries.length < limit}
                                className="rounded-lg border border-(--card-stroke) bg-(--card-80) px-4 py-2 text-sm font-medium disabled:opacity-50"
                            >
                                {CTA_LABELS.nextPage}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </UpgradeGate>
    );
}
