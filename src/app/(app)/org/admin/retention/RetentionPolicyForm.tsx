"use client";

import { useState } from "react";
import { ReviewSummary, type ReviewSummaryRow } from "@/components/shared/ReviewSummary";
import { CTA_LABELS } from "@/lib/design/cta";
import type {
    RetentionPolicy,
    RetentionPolicyCreate,
    RetentionPolicyUpdate,
} from "@/lib/admin/types";

type RetentionPolicyFormMode = "create" | "edit";

type RetentionPolicyFormProps = {
    mode: RetentionPolicyFormMode;
    /** Required when `mode === "edit"`; ignored otherwise. */
    initialPolicy?: RetentionPolicy;
    resourceTypes: string[];
    isSaving: boolean;
    onSaveAction: (data: RetentionPolicyCreate | RetentionPolicyUpdate) => void;
    onCancelAction: () => void;
};

function formatRunDate(d: string | null): string {
    if (!d) return "Never";
    return new Date(d).toLocaleDateString();
}

/**
 * Create/edit form for a single data retention policy (CHAOS-2842). Always
 * shows a live {@link ReviewSummary} explaining the resource type, retention
 * period, and expected deletion effect — plus last/next run for edits — so
 * the admin understands exactly what this policy will permanently delete
 * before saving.
 */
export function RetentionPolicyForm({
    mode,
    initialPolicy,
    resourceTypes,
    isSaving,
    onSaveAction,
    onCancelAction,
}: RetentionPolicyFormProps) {
    const [resourceType, setResourceType] = useState(initialPolicy?.resource_type ?? "");
    const [retentionDays, setRetentionDays] = useState(initialPolicy?.retention_days ?? 90);
    const [description, setDescription] = useState(initialPolicy?.description ?? "");

    const canSave = mode === "edit" || resourceType !== "";
    const effectiveResourceType =
        mode === "edit" ? (initialPolicy?.resource_type ?? "") : resourceType;

    function handleSave() {
        if (!canSave) return;
        const trimmedDescription = description.trim();
        if (mode === "edit") {
            onSaveAction({
                retention_days: retentionDays,
                description: trimmedDescription || null,
            });
        } else {
            onSaveAction({
                resource_type: resourceType,
                retention_days: retentionDays,
                description: trimmedDescription || null,
            });
        }
    }

    const reviewRows: ReviewSummaryRow[] = [
        { label: "Resource type", value: effectiveResourceType || "Not selected" },
        {
            label: "Retention period",
            value: `${retentionDays} day${retentionDays === 1 ? "" : "s"}`,
        },
        {
            label: "Expected effect",
            value: effectiveResourceType
                ? `${effectiveResourceType} records older than ${retentionDays} days will be automatically and permanently deleted on each scheduled run.`
                : "Select a resource type to see the expected effect.",
        },
    ];

    if (mode === "edit" && initialPolicy) {
        reviewRows.push(
            { label: "Last run", value: formatRunDate(initialPolicy.last_run_at) },
            { label: "Next run", value: formatRunDate(initialPolicy.next_run_at) },
        );
    }

    return (
        <div className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-5">
            <div className="grid gap-4 sm:grid-cols-3">
                <div>
                    <label
                        htmlFor="retention-resource-type"
                        className="mb-1 block text-xs font-medium text-(--ink-muted)"
                    >
                        Resource Type
                    </label>
                    {mode === "edit" ? (
                        <input
                            id="retention-resource-type"
                            type="text"
                            value={effectiveResourceType}
                            disabled
                            className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-(--ink-muted)"
                        />
                    ) : (
                        <select
                            id="retention-resource-type"
                            value={resourceType}
                            onChange={(event) => setResourceType(event.target.value)}
                            disabled={isSaving}
                            className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm focus:border-(--accent) focus:outline-none"
                        >
                            <option value="">Select...</option>
                            {resourceTypes.map((rt) => (
                                <option key={rt} value={rt}>
                                    {rt}
                                </option>
                            ))}
                        </select>
                    )}
                </div>
                <div>
                    <label
                        htmlFor="retention-days"
                        className="mb-1 block text-xs font-medium text-(--ink-muted)"
                    >
                        Retention Days
                    </label>
                    <input
                        id="retention-days"
                        type="number"
                        min={1}
                        value={retentionDays}
                        disabled={isSaving}
                        onChange={(event) =>
                            setRetentionDays(parseInt(event.target.value, 10) || 90)
                        }
                        className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm focus:border-(--accent) focus:outline-none"
                    />
                </div>
                <div>
                    <label
                        htmlFor="retention-description"
                        className="mb-1 block text-xs font-medium text-(--ink-muted)"
                    >
                        Description
                    </label>
                    <input
                        id="retention-description"
                        type="text"
                        placeholder="Optional"
                        value={description ?? ""}
                        disabled={isSaving}
                        onChange={(event) => setDescription(event.target.value)}
                        className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm focus:border-(--accent) focus:outline-none"
                    />
                </div>
            </div>

            <div className="mt-4">
                <ReviewSummary rows={reviewRows} />
            </div>

            <div className="mt-4 flex gap-2">
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving || !canSave}
                    className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                    {isSaving ? CTA_LABELS.savingConfiguration : CTA_LABELS.save}
                </button>
                <button
                    type="button"
                    onClick={onCancelAction}
                    disabled={isSaving}
                    className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                    {CTA_LABELS.cancel}
                </button>
            </div>
        </div>
    );
}
