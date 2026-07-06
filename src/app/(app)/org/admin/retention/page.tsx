"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import {
    listRetentionPolicies,
    createRetentionPolicy,
    updateRetentionPolicy,
    deleteRetentionPolicy,
    executeRetentionPolicy,
    listRetentionResourceTypes,
} from "@/lib/admin/server";
import type {
    RetentionPolicy,
    RetentionPolicyCreate,
    RetentionPolicyUpdate,
} from "@/lib/admin/types";
import { UpgradeGate } from "@/components/billing/UpgradeGate";
import { CTA_LABELS } from "@/lib/design/cta";
import { RetentionPolicyForm } from "./RetentionPolicyForm";
import { RetentionPolicyTable } from "./RetentionPolicyTable";
import { RetentionRunConfirm } from "./RetentionRunConfirm";

type FormState =
    { mode: "closed" } | { mode: "create" } | { mode: "edit"; policy: RetentionPolicy };

function formatDate(d: string | null): string {
    if (!d) return "--";
    return new Date(d).toLocaleDateString();
}

export default function RetentionPolicyPage() {
    const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
    const [resourceTypes, setResourceTypes] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [offset, setOffset] = useState(0);
    const limit = 50;

    const [formState, setFormState] = useState<FormState>({ mode: "closed" });
    const [saving, setSaving] = useState(false);
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [runTarget, setRunTarget] = useState<RetentionPolicy | null>(null);

    const fetchPolicies = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: apiError } = await listRetentionPolicies(limit, offset);
            if (apiError) {
                setError(apiError);
            } else if (data) {
                setPolicies(data.items);
            }
        } catch {
            setError("An unexpected error occurred");
        } finally {
            setLoading(false);
        }
    }, [offset]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchPolicies coordinates async loading state after mount/page changes.
        fetchPolicies();
    }, [fetchPolicies]);

    useEffect(() => {
        listRetentionResourceTypes().then(({ data }) => {
            if (data) setResourceTypes(data);
        });
    }, []);

    const handleSave = async (data: RetentionPolicyCreate | RetentionPolicyUpdate) => {
        setSaving(true);
        const result =
            formState.mode === "edit"
                ? await updateRetentionPolicy(formState.policy.id, data)
                : await createRetentionPolicy(data as RetentionPolicyCreate);
        setSaving(false);
        if (result.error) {
            setError(result.error);
        } else {
            setFormState({ mode: "closed" });
            fetchPolicies();
        }
    };

    const handleToggle = async (policy: RetentionPolicy) => {
        setTogglingId(policy.id);
        const { error: apiError } = await updateRetentionPolicy(policy.id, {
            is_active: !policy.is_active,
        });
        setTogglingId(null);
        if (apiError) {
            setError(apiError);
        } else {
            fetchPolicies();
        }
    };

    const handleDelete = async (policy: RetentionPolicy) => {
        const { error: apiError } = await deleteRetentionPolicy(policy.id);
        if (apiError) {
            setError(apiError);
        } else {
            fetchPolicies();
        }
    };

    const handleExecute = async (id: string) => {
        const result = await executeRetentionPolicy(id, false);
        if (result.error) {
            setError(result.error);
        } else {
            fetchPolicies();
        }
        return result;
    };

    return (
        <UpgradeGate feature="custom_retention" requiredTier="enterprise">
            <div>
                <AdminHeader
                    title="Data Retention"
                    description="Configure data retention policies and cleanup schedules for your organization."
                />

                {error && (
                    <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-500">
                        {error}
                    </div>
                )}

                <div className="mb-6">
                    {formState.mode !== "closed" ? (
                        <RetentionPolicyForm
                            mode={formState.mode}
                            initialPolicy={formState.mode === "edit" ? formState.policy : undefined}
                            resourceTypes={resourceTypes}
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
                            {CTA_LABELS.addRetentionPolicy}
                        </button>
                    )}
                </div>

                {loading ? (
                    <div className="py-12 text-center text-(--ink-muted)">
                        Loading retention policies...
                    </div>
                ) : (
                    <>
                        <RetentionPolicyTable
                            policies={policies}
                            togglingId={togglingId}
                            onEditAction={(policy) => setFormState({ mode: "edit", policy })}
                            onToggleAction={handleToggle}
                            onDeleteAction={handleDelete}
                            onRequestRunAction={setRunTarget}
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
                                Showing {offset + 1}-{offset + policies.length}
                            </span>
                            <button
                                type="button"
                                onClick={() => setOffset((prev) => prev + limit)}
                                disabled={policies.length < limit}
                                className="rounded-lg border border-(--card-stroke) bg-(--card-80) px-4 py-2 text-sm font-medium disabled:opacity-50"
                            >
                                {CTA_LABELS.nextPage}
                            </button>
                        </div>
                    </>
                )}

                <RetentionRunConfirm
                    policy={runTarget}
                    onDryRunAction={(id) => executeRetentionPolicy(id, true)}
                    onExecuteAction={handleExecute}
                    onCloseAction={() => setRunTarget(null)}
                />
            </div>
        </UpgradeGate>
    );
}
