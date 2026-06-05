"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConnectionStatus } from "./ConnectionStatus";
import { testConnection, deleteCredential } from "@/lib/admin/server";
import type { IntegrationCredential } from "@/lib/admin/types";

type CredentialCardProps = {
    credential: IntegrationCredential;
    providerName: string;
    isUsedBySyncConfigs: boolean;
    onEdit: () => void;
};

export function CredentialCard({
    credential,
    providerName,
    isUsedBySyncConfigs,
    onEdit,
}: CredentialCardProps) {
    const [isTesting, startTesting] = useTransition();
    const [isDeleting, startDeleting] = useTransition();
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const status =
        credential.last_test_success === true
            ? "connected"
            : credential.last_test_success === false
              ? "error"
              : "not_configured";

    const handleTest = () => {
        startTesting(async () => {
            const result = await testConnection(credential.provider, { name: credential.name });
            if (result.error || !result.data?.success) {
                toast.error(result.error ?? result.data?.error ?? "Connection test failed");
            } else {
                toast.success("Connection successful");
            }
        });
    };

    const handleDelete = () => {
        startDeleting(async () => {
            const result = await deleteCredential(credential.provider, credential.name);
            if (result.error) {
                toast.error(result.error);
            } else {
                toast.success("Credential deleted");
                setShowDeleteConfirm(false);
            }
        });
    };

    return (
        <div className="flex flex-col justify-between rounded-lg border border-(--border-subtle) bg-(--surface-base) p-6 shadow-sm transition-shadow hover:shadow-md">
            <div>
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-(--ink-base)">{credential.name}</h3>
                    <ConnectionStatus status={status} />
                </div>
                <div className="mb-6 text-sm text-(--ink-muted)">
                    {credential.last_test_at ? (
                        <p>Last tested: {new Date(credential.last_test_at).toLocaleString()}</p>
                    ) : (
                        <p>Never tested</p>
                    )}
                </div>
            </div>
            <div className="mt-auto flex items-center gap-2">
                <button
                    type="button"
                    onClick={handleTest}
                    disabled={isTesting || isDeleting}
                    className="inline-flex items-center justify-center rounded-md border border-(--border-subtle) bg-(--surface-base) px-3 py-1.5 text-sm font-medium text-(--ink-base) hover:bg-(--surface-muted) disabled:opacity-50"
                >
                    {isTesting ? "Testing..." : "Test"}
                </button>
                <button
                    type="button"
                    onClick={onEdit}
                    disabled={isTesting || isDeleting}
                    className="inline-flex items-center justify-center rounded-md border border-(--border-subtle) bg-(--surface-base) px-3 py-1.5 text-sm font-medium text-(--ink-base) hover:bg-(--surface-muted) disabled:opacity-50"
                >
                    Edit
                </button>
                <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isTesting || isDeleting}
                    className="inline-flex items-center justify-center rounded-md border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-500/20 disabled:opacity-50"
                >
                    Delete
                </button>
            </div>

            {showDeleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-xl border border-(--card-stroke) bg-(--card) p-6 shadow-2xl">
                        <h3 className="mb-4 text-lg font-semibold text-(--foreground)">
                            Delete Credential
                        </h3>
                        <p className="mb-4 text-sm text-(--ink-muted)">
                            Are you sure you want to delete <strong>{credential.name}</strong>?
                        </p>
                        {isUsedBySyncConfigs && (
                            <div className="mb-6 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-600">
                                <strong>Warning:</strong> This credential is used by active sync
                                configs. Deleting it will disconnect {providerName} for those
                                configs.
                            </div>
                        )}
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowDeleteConfirm(false)}
                                disabled={isDeleting}
                                className="rounded-md border border-(--card-stroke) px-4 py-2 text-sm hover:bg-(--card-80) disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                            >
                                {isDeleting ? "Deleting..." : "Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
