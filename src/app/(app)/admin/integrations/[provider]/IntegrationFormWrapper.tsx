"use client";

import { useState } from "react";
import { IntegrationForm } from "@/components/admin/integrations/IntegrationForm";
import {
  GitHubForm,
  GitLabForm,
  JiraForm,
  LinearForm,
  LaunchDarklyForm,
} from "@/components/admin/integrations/ProviderForms";
import { createCredential, testConnection } from "@/lib/admin/server";
import type { IntegrationCredential } from "@/lib/admin/types";
import type { ConnectionStatusType } from "@/components/admin/integrations/ConnectionStatus";

type IntegrationFormWrapperProps = {
  provider: string;
  providerName: string;
  initialStatus: ConnectionStatusType;
  existingCredential?: IntegrationCredential;
  onCancel?: () => void;
  onSuccess?: () => void;
};

export function IntegrationFormWrapper({
  provider,
  providerName,
  initialStatus,
  existingCredential,
  onCancel,
  onSuccess,
}: IntegrationFormWrapperProps) {
  const [name, setName] = useState(existingCredential?.name ?? "");

  const handleSave = async (formData: Record<string, FormDataEntryValue>): Promise<void> => {
    const credentials: Record<string, unknown> = {};
    const config: Record<string, unknown> = {};

    Object.entries(formData).forEach(([key, value]) => {
      if (key === "credential_name") return;
      if (key.startsWith("config_")) {
        config[key.replace("config_", "")] = value;
      } else {
        credentials[key] = value;
      }
    });

    const credentialName = (formData.credential_name as string) || name || "default";

    const result = await createCredential({
      provider,
      name: credentialName,
      credentials,
      config: Object.keys(config).length > 0 ? config : undefined,
    });

    if (result.error) {
      throw new Error(result.error);
    }

    onSuccess?.();
  };

  const handleTestConnection = async (
    formData: Record<string, FormDataEntryValue>,
  ): Promise<boolean> => {
    const credentials: Record<string, unknown> = {};
    Object.entries(formData).forEach(([key, value]) => {
      if (key === "credential_name") return;
      if (!key.startsWith("config_")) {
        credentials[key] = value;
      }
    });

    const credentialName = (formData.credential_name as string) || name || "default";

    const result = await testConnection(provider, { name: credentialName, credentials });

    if (result.error) {
      throw new Error(result.error);
    }

    return result.data?.success ?? false;
  };

  const renderFormFields = () => {
    switch (provider) {
      case "github":
        return <GitHubForm />;
      case "gitlab":
        return <GitLabForm />;
      case "jira":
        return <JiraForm />;
      case "linear":
        return <LinearForm />;
      case "launchdarkly":
        return <LaunchDarklyForm />;
      default:
        return null;
    }
  };

  return (
    <IntegrationForm
      providerName={providerName}
      initialStatus={initialStatus}
      onSave={handleSave}
      onTestConnection={handleTestConnection}
      onCancel={onCancel}
    >
      <div>
        <label htmlFor="credential_name" className="block text-sm font-medium text-(--ink-base)">
          Credential Name
        </label>
        <div className="mt-1">
          <input
            type="text"
            name="credential_name"
            id="credential_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!!existingCredential}
            className="block w-full rounded-md border-(--border-base) bg-(--surface-base) px-3 py-2 text-(--ink-base) shadow-sm focus:border-(--surface-inverted) focus:outline-none focus:ring-1 focus:ring-(--surface-inverted) sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder='e.g., "Production Token" (defaults to "default")'
          />
        </div>
        {existingCredential && (
          <p className="mt-2 text-sm text-(--ink-muted)">
            Credential name cannot be changed after creation.
          </p>
        )}
      </div>
      {renderFormFields()}
    </IntegrationForm>
  );
}
