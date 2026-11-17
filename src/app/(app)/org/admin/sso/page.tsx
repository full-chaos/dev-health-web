"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";

import { AdminErrorNotice } from "@/components/admin/AdminErrorNotice";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Button } from "@/components/shared/Button";
import { DataState } from "@/components/ui/DataState";
import { Notice } from "@/components/ui/Notice";
import { Section } from "@/components/ui/Section";
import { formatDateUTC } from "@/lib/formatters";
import { ACTION_FAILED_MESSAGE } from "@/lib/actionFailure";
import { logger } from "@/lib/logger";
import {
    listSsoProviders,
    createSsoProvider,
    updateSsoProvider,
    deleteSsoProvider,
    activateSsoProvider,
    deactivateSsoProvider,
} from "@/lib/admin/server";
import type { SsoProvider, SsoProviderCreate, SsoProviderUpdate } from "@/lib/admin/types";
import { CTA_LABELS } from "@/lib/design/cta";
import { isImpersonationRefusal } from "@/lib/admin/ssoRefusals";
import { SsoProviderForm } from "./SsoProviderForm";
import { SsoProviderTable } from "./SsoProviderTable";

type FormState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; provider: SsoProvider };

const PAGE_SIZE = 50;
const READ_ONLY_NOTICE = "Only owners and admins can change SSO providers.";
const UNAVAILABLE_NOTICE = "The SSO provider service is unavailable. Check again in a moment.";

const formatDate = (value: string | null) => (value ? formatDateUTC(value) : "—");

export default function SsoProvidersPage() {
    const [providers, setProviders] = useState<SsoProvider[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<{ text: string; status?: number } | null>(null);
    const [actionError, setActionError] = useState<{ text: string; status?: number } | null>(null);
    const [writeRefusal, setWriteRefusal] = useState<string | null>(null);
    const [formState, setFormState] = useState<FormState>({ mode: "closed" });
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    const fetchProviders = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const items: SsoProvider[] = [];
            for (;;) {
                const { data, error, status } = await listSsoProviders(PAGE_SIZE, items.length);
                if (error) {
                    setLoadError({ text: error, status });
                    return;
                }
                if (!data) return;
                items.push(...data.items);
                if (data.items.length === 0 || items.length >= data.total) break;
            }
            setProviders(items);
        } catch (err) {
            logger.error({ err }, "Failed to load SSO providers");
            setLoadError({ text: "An unexpected error occurred" });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchProviders coordinates async loading state after mount.
        fetchProviders();
    }, [fetchProviders]);

    const reportActionError = (message: string, status?: number) => {
        if (status === 403) {
            setWriteRefusal(isImpersonationRefusal(message) ? message : READ_ONLY_NOTICE);
            setFormState({ mode: "closed" });
            setActionError(null);
            return;
        }
        setActionError({ text: message, status });
    };

    const run = async (
        id: string | null,
        call: () => Promise<{ error?: string; status?: number }>,
    ) => {
        setActionError(null);
        setBusyId(id);
        let result: { error?: string; status?: number };
        try {
            result = await call();
        } catch {
            result = { error: ACTION_FAILED_MESSAGE };
        } finally {
            setBusyId(null);
        }
        if (result.error) {
            reportActionError(result.error, result.status);
            return false;
        }
        fetchProviders();
        return true;
    };

    const handleSave = async (data: SsoProviderCreate | SsoProviderUpdate) => {
        setSaving(true);
        const ok = await run(null, () =>
            formState.mode === "edit"
                ? updateSsoProvider(formState.provider.id, data as SsoProviderUpdate)
                : createSsoProvider(data as SsoProviderCreate),
        );
        setSaving(false);
        if (ok) setFormState({ mode: "closed" });
    };

    const listForbidden = loadError?.status === 403;
    const unavailable = loadError?.status === 503;
    const canWrite = writeRefusal === null && loadError === null;

    return (
        <div className="space-y-6">
            <AdminHeader
                title="Organization"
                description="Manage the single sign-on providers your members use to sign in."
            >
                {canWrite && formState.mode === "closed" ? (
                    <Button
                        variant="primary"
                        onClick={() => setFormState({ mode: "create" })}
                        icon={<Plus className="h-4 w-4" />}
                    >
                        {CTA_LABELS.addSsoProvider}
                    </Button>
                ) : null}
            </AdminHeader>

            {writeRefusal !== null || listForbidden ? (
                <Notice variant="warn" live={false}>
                    {writeRefusal ?? READ_ONLY_NOTICE}
                </Notice>
            ) : null}

            {loadError && !listForbidden ? (
                unavailable ? (
                    <Notice
                        variant="danger"
                        live={false}
                        action={<Button onClick={fetchProviders}>{CTA_LABELS.retry}</Button>}
                    >
                        {UNAVAILABLE_NOTICE}
                    </Notice>
                ) : (
                    <AdminErrorNotice
                        error={loadError.text}
                        kind="load"
                        status={loadError.status}
                        subject="SSO providers"
                        onRetryAction={fetchProviders}
                    />
                )
            ) : null}

            {actionError ? (
                actionError.status === 503 ? (
                    <Notice variant="danger" live={false}>
                        {UNAVAILABLE_NOTICE}
                    </Notice>
                ) : (
                    <AdminErrorNotice
                        error={actionError.text}
                        kind="action"
                        status={actionError.status}
                        subject="SSO providers"
                        onRetryAction={fetchProviders}
                    />
                )
            ) : null}

            {canWrite && formState.mode !== "closed" ? (
                <SsoProviderForm
                    key={formState.mode === "edit" ? formState.provider.id : "create"}
                    mode={formState.mode}
                    initialProvider={formState.mode === "edit" ? formState.provider : undefined}
                    isSaving={saving}
                    onSaveAction={handleSave}
                    onCancelAction={() => setFormState({ mode: "closed" })}
                />
            ) : null}

            {loadError === null || writeRefusal !== null ? (
                <Section title="SSO providers">
                    {loading ? (
                        <DataState variant="loading" title="Loading SSO providers..." />
                    ) : (
                        <SsoProviderTable
                            providers={providers}
                            canWrite={canWrite}
                            busyId={busyId}
                            onEditAction={(provider) => setFormState({ mode: "edit", provider })}
                            onToggleAction={(provider) =>
                                run(provider.id, () =>
                                    provider.status === "active"
                                        ? deactivateSsoProvider(provider.id)
                                        : activateSsoProvider(provider.id),
                                )
                            }
                            onDeleteAction={(provider) =>
                                run(provider.id, () => deleteSsoProvider(provider.id))
                            }
                            formatDate={formatDate}
                        />
                    )}
                </Section>
            ) : null}
        </div>
    );
}
