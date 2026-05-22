"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { createCredential, testConnection } from "@/lib/admin/server";
import type { IntegrationCredential, Provider } from "@/lib/admin/types";

type EditCredentialModalProps = {
  isOpen: boolean;
  onCloseAction: () => void;
  onEditedAction: (credential: IntegrationCredential) => void;
  provider: Provider;
  existingCredential: IntegrationCredential | null;
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

function getInitialCredentials(
  provider: Provider,
  existingConfig?: Record<string, unknown>,
): Record<string, string> {
  const base: Record<string, string> = ((): Record<string, string> => {
    if (provider === "gitlab") return { token: "", url: "https://gitlab.com" };
    if (provider === "jira") return { email: "", api_token: "", server_url: "" };
    if (provider === "linear") return { api_key: "" };
    if (provider === "launchdarkly")
      return { api_key: "", project_key: "", environment: "production" };
    return { token: "" };
  })();

  if (!existingConfig) return base;

  // Pre-populate non-password fields from existing config if possible
  // Note: The backend doesn't return the actual tokens, so password fields will be empty
  const result: Record<string, string> = { ...base };
  for (const key of Object.keys(result)) {
    if (existingConfig[key] && typeof existingConfig[key] === "string") {
      result[key] = existingConfig[key] as string;
    }
  }
  return result;
}

export function EditCredentialModal({
  isOpen,
  onCloseAction,
  onEditedAction,
  provider,
  existingCredential,
}: EditCredentialModalProps) {
  const [isTesting, startTesting] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const [credentials, setCredentials] = useState<Record<string, string>>(() =>
    getInitialCredentials(provider, existingCredential?.config),
  );
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // React-recommended pattern for resetting local state when a key prop changes,
  // in lieu of useEffect (which would violate `react-hooks/set-state-in-effect`).
  // See https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const targetCredentialId = isOpen && existingCredential ? existingCredential.id : null;
  const [prevCredentialId, setPrevCredentialId] = useState<string | null>(targetCredentialId);
  if (targetCredentialId !== prevCredentialId) {
    setPrevCredentialId(targetCredentialId);
    if (existingCredential) {
      setCredentials(getInitialCredentials(provider, existingCredential.config));
      setTestResult(null);
    }
  }

  const canRunTest = useMemo(() => {
    const fields = PROVIDER_FIELDS[provider];
    return fields.every((field) => {
      if (!field.required) return true;
      return Boolean(credentials[field.key]?.trim());
    });
  }, [credentials, provider]);

  const hasPassedTest = testResult?.success === true;

  if (!isOpen || !existingCredential) {
    return null;
  }

  const handleClose = () => {
    onCloseAction();
  };

  const handleFieldChange = (key: string, value: string) => {
    setCredentials((prev) => ({ ...prev, [key]: value }));
    setTestResult(null);
  };

  const handleTestConnection = () => {
    if (!canRunTest) return;

    startTesting(async () => {
      const result = await testConnection(provider, { name: existingCredential.name, credentials });
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
    if (!hasPassedTest) return;

    startSaving(async () => {
      // We use createCredential which acts as an upsert if the name is the same
      const result = await createCredential({
        provider,
        name: existingCredential.name,
        credentials,
      });
      if (result.error || !result.data) {
        toast.error(result.error ?? "Failed to update credential");
        return;
      }
      onEditedAction(result.data);
      toast.success("Credential updated");
      onCloseAction();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-xl border border-(--card-stroke) bg-(--card) shadow-2xl">
        <div className="flex items-center justify-between border-b border-(--card-stroke) p-6">
          <h2 className="text-lg font-semibold text-(--foreground)">
            Edit {existingCredential.name}
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
            <label htmlFor="edit-credential-name" className="mb-1.5 block text-sm font-medium">
              Credential Name
            </label>
            <input
              id="edit-credential-name"
              type="text"
              value={existingCredential.name}
              disabled
              className="w-full rounded-lg border border-(--card-stroke) bg-(--card-80) px-3 py-2 text-sm text-(--ink-muted) cursor-not-allowed"
            />
          </div>

          {PROVIDER_FIELDS[provider].map((field) => (
            <div key={field.key}>
              <label
                htmlFor={`edit-credential-${field.key}`}
                className="mb-1.5 block text-sm font-medium"
              >
                {field.label}
              </label>
              <input
                id={`edit-credential-${field.key}`}
                type={field.type}
                value={credentials[field.key] ?? ""}
                onChange={(event) => handleFieldChange(field.key, event.target.value)}
                required={field.required}
                placeholder={field.type === "password" ? "Enter new token to update..." : ""}
                className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
              />
            </div>
          ))}

          {testResult && (
            <p className={`text-sm ${testResult.success ? "text-emerald-500" : "text-red-500"}`}>
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
