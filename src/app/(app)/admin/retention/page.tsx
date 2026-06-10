"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import {
    listRetentionPolicies,
    createRetentionPolicy,
    updateRetentionPolicy,
    deleteRetentionPolicy,
    executeRetentionPolicy,
    listRetentionResourceTypes,
} from "@/lib/admin/server";
import type { RetentionPolicy, RetentionPolicyCreate } from "@/lib/admin/types";
import { UpgradeGate } from "@/components/billing/UpgradeGate";

export default function RetentionPolicyPage() {
    const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
    const [resourceTypes, setResourceTypes] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [offset, setOffset] = useState(0);
    const limit = 50;

    const [showAddForm, setShowAddForm] = useState(false);
    const [formData, setFormData] = useState<RetentionPolicyCreate>({
        resource_type: "",
        retention_days: 90,
    });
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [executingId, setExecutingId] = useState<string | null>(null);
    const [executeResult, setExecuteResult] = useState<{
        id: string;
        count: number;
        confirming: boolean;
    } | null>(null);

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

    const handleCreate = async () => {
        if (!formData.resource_type) return;
        setSaving(true);
        const { error: apiError } = await createRetentionPolicy(formData);
        setSaving(false);
        if (apiError) {
            setError(apiError);
        } else {
            setShowAddForm(false);
            setFormData({ resource_type: "", retention_days: 90 });
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

    const handleDryRun = async (id: string) => {
        setExecutingId(id);
        const { data, error: apiError } = await executeRetentionPolicy(id, true);
        setExecutingId(null);
        if (apiError) {
            setError(apiError);
        } else if (data) {
            setExecuteResult({ id, count: data.deleted_count, confirming: false });
        }
    };

    const handleExecute = async (id: string) => {
        if (executeResult?.id === id && executeResult.confirming) {
            setExecutingId(id);
            const { data, error: apiError } = await executeRetentionPolicy(id, false);
            setExecutingId(null);
            setExecuteResult(null);
            if (apiError) {
                setError(apiError);
            } else if (data) {
                fetchPolicies();
            }
        } else if (executeResult?.id === id) {
            setExecuteResult({ ...executeResult, confirming: true });
        }
    };

    const handleDelete = async (id: string) => {
        if (deletingId === id) {
            const { error: apiError } = await deleteRetentionPolicy(id);
            setDeletingId(null);
            if (apiError) {
                setError(apiError);
            } else {
                fetchPolicies();
            }
        } else {
            setDeletingId(id);
        }
    };

    const formatDate = (d: string | null) => {
        if (!d) return "--";
        return new Date(d).toLocaleDateString();
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
                    {showAddForm ? (
                        <div className="rounded-2xl border border-(--border) bg-(--card-80) p-5">
                            <div className="grid gap-4 sm:grid-cols-3">
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-(--ink-muted)">
                                        Resource Type
                                    </label>
                                    <select
                                        value={formData.resource_type}
                                        onChange={(e) =>
                                            setFormData({
                                                ...formData,
                                                resource_type: e.target.value,
                                            })
                                        }
                                        className="w-full rounded-lg border border-(--border) bg-(--card-70) px-3 py-2 text-sm focus:border-(--accent) focus:outline-none"
                                    >
                                        <option value="">Select...</option>
                                        {resourceTypes.map((rt) => (
                                            <option key={rt} value={rt}>
                                                {rt}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-(--ink-muted)">
                                        Retention Days
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={formData.retention_days ?? 90}
                                        onChange={(e) =>
                                            setFormData({
                                                ...formData,
                                                retention_days: parseInt(e.target.value) || 90,
                                            })
                                        }
                                        className="w-full rounded-lg border border-(--border) bg-(--card-70) px-3 py-2 text-sm focus:border-(--accent) focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-(--ink-muted)">
                                        Description
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Optional"
                                        value={formData.description ?? ""}
                                        onChange={(e) =>
                                            setFormData({
                                                ...formData,
                                                description: e.target.value || null,
                                            })
                                        }
                                        className="w-full rounded-lg border border-(--border) bg-(--card-70) px-3 py-2 text-sm focus:border-(--accent) focus:outline-none"
                                    />
                                </div>
                            </div>
                            <div className="mt-4 flex gap-2">
                                <button
                                    type="button"
                                    onClick={handleCreate}
                                    disabled={saving}
                                    className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                                >
                                    {saving ? "Saving..." : "Save"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowAddForm(false);
                                        setFormData({ resource_type: "", retention_days: 90 });
                                    }}
                                    className="rounded-lg border border-(--border) bg-(--card-70) px-4 py-2 text-sm font-medium"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setShowAddForm(true)}
                            className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white"
                        >
                            Add Policy
                        </button>
                    )}
                </div>

                {loading ? (
                    <div className="py-12 text-center text-(--ink-muted)">
                        Loading retention policies...
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto rounded-2xl border border-(--border) bg-(--card-80)">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-(--border) bg-(--card-70) text-(--ink-muted)">
                                        <th className="px-4 py-3 text-left font-medium">
                                            Resource Type
                                        </th>
                                        <th className="px-4 py-3 text-left font-medium">
                                            Retention
                                        </th>
                                        <th className="px-4 py-3 text-left font-medium">Status</th>
                                        <th className="px-4 py-3 text-left font-medium">
                                            Last Run
                                        </th>
                                        <th className="px-4 py-3 text-left font-medium">Deleted</th>
                                        <th className="px-4 py-3 text-left font-medium">
                                            Next Run
                                        </th>
                                        <th className="px-4 py-3 text-right font-medium">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {policies.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={7}
                                                className="px-4 py-8 text-center text-(--ink-muted)"
                                            >
                                                No retention policies configured.
                                            </td>
                                        </tr>
                                    ) : (
                                        policies.map((policy) => (
                                            <tr
                                                key={policy.id}
                                                className="border-b border-(--border) last:border-0"
                                            >
                                                <td className="px-4 py-3 font-mono text-xs">
                                                    {policy.resource_type}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {policy.retention_days} days
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span
                                                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                                            policy.is_active
                                                                ? "bg-green-500/10 text-green-500"
                                                                : "bg-red-500/10 text-red-500"
                                                        }`}
                                                    >
                                                        {policy.is_active ? "Active" : "Inactive"}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-(--ink-muted)">
                                                    {policy.last_run_at
                                                        ? formatDate(policy.last_run_at)
                                                        : "Never"}
                                                </td>
                                                <td className="px-4 py-3 text-(--ink-muted)">
                                                    {policy.last_run_deleted_count ?? "--"}
                                                </td>
                                                <td className="px-4 py-3 text-(--ink-muted)">
                                                    {formatDate(policy.next_run_at)}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleToggle(policy)}
                                                            disabled={togglingId === policy.id}
                                                            className="rounded-lg border border-(--border) bg-(--card-70) px-3 py-1 text-xs font-medium disabled:opacity-50"
                                                        >
                                                            {policy.is_active
                                                                ? "Disable"
                                                                : "Enable"}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDryRun(policy.id)}
                                                            disabled={executingId === policy.id}
                                                            className="rounded-lg border border-(--border) bg-(--card-70) px-3 py-1 text-xs font-medium disabled:opacity-50"
                                                        >
                                                            Dry Run
                                                        </button>
                                                        {executeResult?.id === policy.id && (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    handleExecute(policy.id)
                                                                }
                                                                className="rounded-lg bg-red-500 px-3 py-1 text-xs font-medium text-white"
                                                            >
                                                                {executeResult.confirming
                                                                    ? `Confirm delete ${executeResult.count} records?`
                                                                    : `${executeResult.count} would be deleted`}
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDelete(policy.id)}
                                                            className="rounded-lg bg-red-500/10 px-3 py-1 text-xs font-medium text-red-500"
                                                        >
                                                            {deletingId === policy.id
                                                                ? "Confirm?"
                                                                : "Delete"}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-4 flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
                                disabled={offset === 0}
                                className="rounded-lg border border-(--border) bg-(--card-80) px-4 py-2 text-sm font-medium disabled:opacity-50"
                            >
                                Previous
                            </button>
                            <span className="text-sm text-(--ink-muted)">
                                Showing {offset + 1}-{offset + policies.length}
                            </span>
                            <button
                                type="button"
                                onClick={() => setOffset((prev) => prev + limit)}
                                disabled={policies.length < limit}
                                className="rounded-lg border border-(--border) bg-(--card-80) px-4 py-2 text-sm font-medium disabled:opacity-50"
                            >
                                Next
                            </button>
                        </div>
                    </>
                )}
            </div>
        </UpgradeGate>
    );
}
