"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";

import { AdminErrorNotice } from "@/components/admin/AdminErrorNotice";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminPager } from "@/components/admin/AdminPager";
import { Button } from "@/components/shared/Button";
import { DataState } from "@/components/ui/DataState";
import { Section } from "@/components/ui/Section";
import { logger } from "@/lib/logger";
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
    const [errorKind, setErrorKind] = useState<"load" | "action">("load");
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
                // The backend text goes to the log; the page says one plain sentence + Retry.
                logger.error({ err: apiError }, "Failed to load retention policies");
                setErrorKind("load");
                setError(apiError);
            } else if (data) {
                setPolicies(data.items);
            }
        } catch (err) {
            logger.error({ err }, "Failed to load retention policies");
            setErrorKind("load");
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
            setErrorKind("action");
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
            setErrorKind("action");
            setError(apiError);
        } else {
            fetchPolicies();
        }
    };

    const handleDelete = async (policy: RetentionPolicy) => {
        const { error: apiError } = await deleteRetentionPolicy(policy.id);
        if (apiError) {
            setErrorKind("action");
            setError(apiError);
        } else {
            fetchPolicies();
        }
    };

    const handleExecute = async (id: string) => {
        const result = await executeRetentionPolicy(id, false);
        if (result.error) {
            setErrorKind("action");
            setError(result.error);
        } else if (result.data?.error) {
            setErrorKind("action");
            // The backend can report a failed run as an HTTP 200 with an
            // embedded error (e.g. the policy went inactive, or the resource
            // type isn't implemented) — surface it instead of silently
            // refetching as if the run succeeded.
            setError(result.data.error);
        } else {
            fetchPolicies();
        }
        return result;
    };

    return (
        <UpgradeGate feature="custom_retention" requiredTier="enterprise">
            <div className="space-y-6">
                <AdminHeader
                    title="Organization"
                    description="Configure data retention policies and cleanup schedules for your organization."
                >
                    {formState.mode === "closed" ? (
                        <Button
                            variant="primary"
                            onClick={() => setFormState({ mode: "create" })}
                            icon={<Plus className="h-4 w-4" />}
                        >
                            {CTA_LABELS.addRetentionPolicy}
                        </Button>
                    ) : null}
                </AdminHeader>

                {error && (
                    <AdminErrorNotice
                        error={error}
                        kind={errorKind}
                        subject="Retention policies"
                        onRetryAction={fetchPolicies}
                    />
                )}

                {formState.mode !== "closed" ? (
                    <RetentionPolicyForm
                        mode={formState.mode}
                        initialPolicy={formState.mode === "edit" ? formState.policy : undefined}
                        resourceTypes={resourceTypes}
                        isSaving={saving}
                        onSaveAction={handleSave}
                        onCancelAction={() => setFormState({ mode: "closed" })}
                    />
                ) : null}

                <Section title="Data Retention">
                    {loading ? (
                        <DataState variant="loading" title="Loading retention policies..." />
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

                            {policies.length > 0 || offset > 0 ? (
                                <AdminPager
                                    offset={offset}
                                    count={policies.length}
                                    hasNext={policies.length >= limit}
                                    onPreviousAction={() =>
                                        setOffset((prev) => Math.max(0, prev - limit))
                                    }
                                    onNextAction={() => setOffset((prev) => prev + limit)}
                                />
                            ) : null}
                        </>
                    )}
                </Section>

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
