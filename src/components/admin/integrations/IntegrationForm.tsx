"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { ConnectionStatus, ConnectionStatusType } from "./ConnectionStatus";

type FormDataRecord = Record<string, FormDataEntryValue>;

type IntegrationFormProps = {
    providerName: string;
    initialStatus: ConnectionStatusType;
    onSave: (data: FormDataRecord) => Promise<void>;
    onTestConnection: (data: FormDataRecord) => Promise<boolean>;
    onCancel?: () => void;
    children: React.ReactNode;
};

export function IntegrationForm({
    initialStatus,
    onSave,
    onTestConnection,
    onCancel,
    children,
}: IntegrationFormProps) {
    const [status, setStatus] = useState<ConnectionStatusType>(initialStatus);
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);

        const formData = new FormData(e.target as HTMLFormElement);
        const data = Object.fromEntries(formData.entries());

        try {
            await onSave(data);
            toast.success("Settings saved successfully.");
        } catch {
            toast.error("Failed to save settings.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleTestConnection = async (e: React.MouseEvent) => {
        e.preventDefault();
        setIsTesting(true);
        setStatus("connecting");

        const form = (e.target as HTMLElement).closest("form");
        const formData = new FormData(form!);
        const data = Object.fromEntries(formData.entries());

        try {
            const success = await onTestConnection(data);
            setStatus(success ? "connected" : "error");
            if (success) {
                toast.success("Connection successful!");
            } else {
                toast.error("Connection failed. Please check your credentials.");
            }
        } catch (err) {
            setStatus("error");
            toast.error(
                err instanceof Error
                    ? err.message
                    : "An error occurred while testing the connection.",
            );
        } finally {
            setIsTesting(false);
        }
    };

    return (
        <div className="max-w-2xl rounded-lg border border-(--border) bg-(--surface-base) p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-(--ink-base)">Configuration</h2>
                <ConnectionStatus status={status} />
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {children}

                <div className="flex items-center justify-end gap-4 pt-4 border-t border-(--border)">
                    {onCancel && (
                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={isTesting || isSaving}
                            className="rounded-md border border-(--border-base) bg-transparent px-4 py-2 text-sm font-medium text-(--ink-base) hover:bg-(--surface-muted) focus:outline-none focus:ring-2 focus:ring-(--surface-inverted) focus:ring-offset-2 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={isTesting || isSaving}
                        className="rounded-md border border-(--border-base) bg-transparent px-4 py-2 text-sm font-medium text-(--ink-base) hover:bg-(--surface-muted) focus:outline-none focus:ring-2 focus:ring-(--surface-inverted) focus:ring-offset-2 disabled:opacity-50"
                    >
                        {isTesting ? "Testing..." : "Test Connection"}
                    </button>
                    <button
                        type="submit"
                        disabled={isSaving || isTesting}
                        className="rounded-md bg-(--surface-inverted) px-4 py-2 text-sm font-medium text-(--ink-inverted) hover:bg-(--surface-inverted)/90 focus:outline-none focus:ring-2 focus:ring-(--surface-inverted) focus:ring-offset-2 disabled:opacity-50"
                    >
                        {isSaving ? "Saving..." : "Save Changes"}
                    </button>
                </div>
            </form>
        </div>
    );
}
