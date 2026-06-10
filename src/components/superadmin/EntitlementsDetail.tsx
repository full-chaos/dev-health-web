"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import type { FeatureFlag, FeatureOverride, OrgEntitlements } from "@/lib/admin/types";
import { createFeatureOverride, deleteFeatureOverride } from "@/lib/admin/server";

type EntitlementsDetailProps = {
    orgId: string;
    entitlements: OrgEntitlements;
    overrides: FeatureOverride[];
    featureFlags: FeatureFlag[];
};

export function EntitlementsDetail({
    orgId,
    entitlements,
    overrides,
    featureFlags,
}: EntitlementsDetailProps) {
    const [isCreating, setIsCreating] = useState(false);
    const [selectedFeatureId, setSelectedFeatureId] = useState("");
    const [overrideReason, setOverrideReason] = useState("");
    const [overrideEnabled, setOverrideEnabled] = useState(true);

    const handleCreateOverride = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFeatureId) return;

        try {
            const { error } = await createFeatureOverride(orgId, {
                feature_id: selectedFeatureId,
                is_enabled: overrideEnabled,
                reason: overrideReason || null,
            });

            if (error) {
                toast.error(`Failed to create override: ${error}`);
            } else {
                toast.success("Override created successfully");
                setIsCreating(false);
                setSelectedFeatureId("");
                setOverrideReason("");
                setOverrideEnabled(true);
            }
        } catch {
            toast.error("An unexpected error occurred");
        }
    };

    const handleDeleteOverride = async (overrideId: string) => {
        if (!confirm("Are you sure you want to delete this override?")) return;

        try {
            const { error } = await deleteFeatureOverride(orgId, overrideId);
            if (error) {
                toast.error(`Failed to delete override: ${error}`);
            } else {
                toast.success("Override deleted successfully");
            }
        } catch {
            toast.error("An unexpected error occurred");
        }
    };

    return (
        <div className="space-y-8">
            {/* Limits Section */}
            <div className="rounded-2xl border border-(--border) bg-(--card-80) p-6">
                <h3 className="mb-4 text-lg font-medium">Limits</h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-xl border border-(--border) bg-(--card-70) p-4">
                        <div className="text-sm text-(--ink-muted)">Licensed Users</div>
                        <div className="mt-1 text-2xl font-semibold">
                            {entitlements.licensed_users === null
                                ? "Unlimited"
                                : entitlements.licensed_users}
                        </div>
                    </div>
                    <div className="rounded-xl border border-(--border) bg-(--card-70) p-4">
                        <div className="text-sm text-(--ink-muted)">Licensed Repos</div>
                        <div className="mt-1 text-2xl font-semibold">
                            {entitlements.licensed_repos === null
                                ? "Unlimited"
                                : entitlements.licensed_repos}
                        </div>
                    </div>
                    {Object.entries(entitlements.limits).map(([key, value]) => (
                        <div
                            key={key}
                            className="rounded-xl border border-(--border) bg-(--card-70) p-4"
                        >
                            <div className="text-sm text-(--ink-muted)">{key}</div>
                            <div className="mt-1 text-2xl font-semibold">
                                {value === null ? "Unlimited" : value}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Features Section */}
            <div className="rounded-2xl border border-(--border) bg-(--card-80) p-6">
                <h3 className="mb-4 text-lg font-medium">Features</h3>
                <div className="overflow-x-auto rounded-xl border border-(--border)">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-(--card-70) text-(--ink-muted)">
                            <tr>
                                <th className="px-4 py-3 font-medium">Feature</th>
                                <th className="px-4 py-3 font-medium">Status</th>
                                <th className="px-4 py-3 font-medium">Source</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-(--border)">
                            {Object.entries(entitlements.features).map(([key, enabled]) => {
                                const isOverridden =
                                    entitlements.features_override &&
                                    key in entitlements.features_override;
                                return (
                                    <tr key={key}>
                                        <td className="px-4 py-3 font-mono text-xs">{key}</td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                                    enabled
                                                        ? "bg-green-500/10 text-green-500"
                                                        : "bg-red-500/10 text-red-500"
                                                }`}
                                            >
                                                {enabled ? "Enabled" : "Disabled"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-(--ink-muted)">
                                            {isOverridden ? (
                                                <span className="text-purple-400">Override</span>
                                            ) : (
                                                "Tier Default"
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Overrides Section */}
            <div className="rounded-2xl border border-(--border) bg-(--card-80) p-6">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-medium">Feature Overrides</h3>
                    <button
                        type="button"
                        onClick={() => setIsCreating(!isCreating)}
                        className="rounded-lg bg-(--accent) px-3 py-1.5 text-sm font-medium text-white hover:bg-(--accent)/90"
                    >
                        {isCreating ? "Cancel" : "Add Override"}
                    </button>
                </div>

                {isCreating && (
                    <form
                        onSubmit={handleCreateOverride}
                        className="mb-6 rounded-xl border border-(--border) bg-(--card-70) p-4"
                    >
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label
                                    htmlFor="feature-select"
                                    className="mb-1 block text-xs font-medium text-(--ink-muted)"
                                >
                                    Feature
                                </label>
                                <select
                                    id="feature-select"
                                    value={selectedFeatureId}
                                    onChange={(e) => setSelectedFeatureId(e.target.value)}
                                    className="w-full rounded-lg border border-(--border) bg-(--card-80) px-3 py-2 text-sm focus:border-(--accent) focus:outline-none"
                                    required
                                >
                                    <option value="">Select a feature...</option>
                                    {featureFlags.map((flag) => (
                                        <option key={flag.id} value={flag.id}>
                                            {flag.key} ({flag.name})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label
                                    htmlFor="state-select"
                                    className="mb-1 block text-xs font-medium text-(--ink-muted)"
                                >
                                    State
                                </label>
                                <select
                                    id="state-select"
                                    value={overrideEnabled ? "true" : "false"}
                                    onChange={(e) => setOverrideEnabled(e.target.value === "true")}
                                    className="w-full rounded-lg border border-(--border) bg-(--card-80) px-3 py-2 text-sm focus:border-(--accent) focus:outline-none"
                                >
                                    <option value="true">Enabled</option>
                                    <option value="false">Disabled</option>
                                </select>
                            </div>
                            <div className="sm:col-span-2">
                                <label
                                    htmlFor="reason-input"
                                    className="mb-1 block text-xs font-medium text-(--ink-muted)"
                                >
                                    Reason
                                </label>
                                <input
                                    id="reason-input"
                                    type="text"
                                    value={overrideReason}
                                    onChange={(e) => setOverrideReason(e.target.value)}
                                    placeholder="Why is this override being applied?"
                                    className="w-full rounded-lg border border-(--border) bg-(--card-80) px-3 py-2 text-sm focus:border-(--accent) focus:outline-none"
                                />
                            </div>
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button
                                type="submit"
                                className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90"
                            >
                                Save Override
                            </button>
                        </div>
                    </form>
                )}

                {overrides.length === 0 ? (
                    <div className="text-sm text-(--ink-muted)">No overrides active.</div>
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-(--border)">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-(--card-70) text-(--ink-muted)">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Feature</th>
                                    <th className="px-4 py-3 font-medium">State</th>
                                    <th className="px-4 py-3 font-medium">Reason</th>
                                    <th className="px-4 py-3 font-medium">Created</th>
                                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-(--border)">
                                {overrides.map((override) => (
                                    <tr key={override.id}>
                                        <td className="px-4 py-3 font-mono text-xs">
                                            {override.feature_key}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                                    override.is_enabled
                                                        ? "bg-green-500/10 text-green-500"
                                                        : "bg-red-500/10 text-red-500"
                                                }`}
                                            >
                                                {override.is_enabled ? "Enabled" : "Disabled"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-(--ink-muted)">
                                            {override.reason || "-"}
                                        </td>
                                        <td className="px-4 py-3 text-(--ink-muted)">
                                            {new Date(override.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteOverride(override.id)}
                                                className="text-red-500 hover:underline"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
