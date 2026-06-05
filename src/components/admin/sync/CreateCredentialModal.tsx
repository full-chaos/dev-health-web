import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { createCredential, testConnection } from "@/lib/admin/server";
import type { IntegrationCredential, Provider } from "@/lib/admin/types";

type CreateCredentialModalProps = {
    isOpen: boolean;
    onCloseAction: () => void;
    onCreatedAction: (credential: IntegrationCredential) => void;
    provider: Provider;
};

type ProviderField = {
    key: string;
    label: string;
    type: "text" | "password";
    required?: boolean;
};

const PROVIDER_FIELDS: Record<Provider, ProviderField[]> = {
    github: [{ key: "token", label: "Token", type: "password", required: true }],
    gitlab: [
        { key: "token", label: "Token", type: "password", required: true },
        { key: "url", label: "GitLab URL", type: "text", required: false },
    ],
    jira: [
        { key: "email", label: "Email", type: "text", required: true },
        { key: "api_token", label: "API Token", type: "password", required: true },
        { key: "server_url", label: "Server URL", type: "text", required: true },
    ],
    linear: [{ key: "api_key", label: "API Key", type: "password", required: true }],
    launchdarkly: [
        { key: "api_key", label: "API Token", type: "password", required: true },
        { key: "project_key", label: "Project Key", type: "text", required: true },
        { key: "environment", label: "Environment Key", type: "text", required: true },
    ],
};

function getInitialCredentials(provider: Provider): Record<string, string> {
    if (provider === "gitlab") {
        return { token: "", url: "https://gitlab.com" };
    }
    if (provider === "jira") {
        return { email: "", api_token: "", server_url: "" };
    }
    if (provider === "linear") {
        return { api_key: "" };
    }
    if (provider === "launchdarkly") {
        return { api_key: "", project_key: "", environment: "production" };
    }
    return { token: "" };
}

export function CreateCredentialModal({
    isOpen,
    onCloseAction,
    onCreatedAction,
    provider,
}: CreateCredentialModalProps) {
    const [isTesting, startTesting] = useTransition();
    const [isSaving, startSaving] = useTransition();
    const [name, setName] = useState("");
    const [credentials, setCredentials] = useState<Record<string, string>>(
        getInitialCredentials(provider),
    );
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(
        null,
    );

    const canRunTest = useMemo(() => {
        const fields = PROVIDER_FIELDS[provider];
        if (!name.trim()) {
            return false;
        }
        return fields.every((field) => {
            if (!field.required) {
                return true;
            }
            return Boolean(credentials[field.key]?.trim());
        });
    }, [credentials, name, provider]);

    const hasPassedTest = testResult?.success === true;

    if (!isOpen) {
        return null;
    }

    const handleClose = () => {
        onCloseAction();
    };

    const handleFieldChange = (key: string, value: string) => {
        setCredentials((prev) => ({ ...prev, [key]: value }));
        setTestResult(null);
    };

    const handleNameChange = (value: string) => {
        setName(value);
        setTestResult(null);
    };

    const handleTestConnection = () => {
        if (!canRunTest) {
            return;
        }

        startTesting(async () => {
            const result = await testConnection(provider, { name: name.trim(), credentials });
            if (result.error || !result.data?.success) {
                setTestResult({
                    success: false,
                    message: result.error ?? result.data?.error ?? "Connection test failed",
                });
                return;
            }
            setTestResult({ success: true, message: "Connection successful" });
        });
    };

    const handleSave = () => {
        if (!hasPassedTest) {
            return;
        }

        startSaving(async () => {
            const result = await createCredential({
                provider,
                name: name.trim(),
                credentials,
            });
            if (result.error || !result.data) {
                toast.error(result.error ?? "Failed to create credential");
                return;
            }
            onCreatedAction(result.data);
            toast.success("Credential created");
            onCloseAction();
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-xl rounded-xl border border-(--card-stroke) bg-(--card) shadow-2xl">
                <div className="flex items-center justify-between border-b border-(--card-stroke) p-6">
                    <h2 className="text-lg font-semibold text-(--foreground)">
                        Create {provider.charAt(0).toUpperCase() + provider.slice(1)} Credential
                    </h2>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="rounded-md px-2 py-1 text-(--ink-muted) hover:bg-(--card-80)"
                    >
                        Close
                    </button>
                </div>

                <div className="space-y-4 p-6">
                    <div>
                        <label
                            htmlFor="credential-name"
                            className="mb-1.5 block text-sm font-medium"
                        >
                            Credential Name
                        </label>
                        <input
                            id="credential-name"
                            type="text"
                            value={name}
                            onChange={(event) => handleNameChange(event.target.value)}
                            className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                            placeholder="e.g., Primary token"
                        />
                    </div>

                    {PROVIDER_FIELDS[provider].map((field) => (
                        <div key={field.key}>
                            <label
                                htmlFor={`credential-${field.key}`}
                                className="mb-1.5 block text-sm font-medium"
                            >
                                {field.label}
                            </label>
                            <input
                                id={`credential-${field.key}`}
                                type={field.type}
                                value={credentials[field.key] ?? ""}
                                onChange={(event) =>
                                    handleFieldChange(field.key, event.target.value)
                                }
                                required={field.required}
                                className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                            />
                        </div>
                    ))}

                    {testResult && (
                        <p
                            className={`text-sm ${testResult.success ? "text-emerald-500" : "text-red-500"}`}
                        >
                            {testResult.success ? "✓" : "✕"} {testResult.message}
                        </p>
                    )}

                    <div className="flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="rounded-md border border-(--card-stroke) px-4 py-2 text-sm"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleTestConnection}
                            disabled={isTesting || isSaving || !canRunTest}
                            className="rounded-md border border-(--card-stroke) px-4 py-2 text-sm hover:bg-(--card-80) disabled:opacity-50"
                        >
                            {isTesting ? "Testing..." : "Test Connection"}
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={!hasPassedTest || isSaving}
                            className="rounded-md bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90 disabled:opacity-50"
                        >
                            {isSaving ? "Saving..." : "Save"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
