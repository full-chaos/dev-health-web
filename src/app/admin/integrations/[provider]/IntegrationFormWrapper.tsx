"use client";

import { IntegrationForm } from "@/components/admin/integrations/IntegrationForm";
import {
  GitHubForm,
  GitLabForm,
  JiraForm,
  LinearForm,
} from "@/components/admin/integrations/ProviderForms";
import { createCredential, testConnection } from "@/lib/admin/server";
import type { IntegrationCredential } from "@/lib/admin/types";
import type { ConnectionStatusType } from "@/components/admin/integrations/ConnectionStatus";

type IntegrationFormWrapperProps = {
  provider: string;
  providerName: string;
  initialStatus: ConnectionStatusType;
  existingCredential?: IntegrationCredential;
};

export function IntegrationFormWrapper({
  provider,
  providerName,
  initialStatus,
}: IntegrationFormWrapperProps) {
  const handleSave = async (formData: Record<string, FormDataEntryValue>): Promise<void> => {
    const credentials: Record<string, unknown> = {};
    const config: Record<string, unknown> = {};

    Object.entries(formData).forEach(([key, value]) => {
      if (key.startsWith("config_")) {
        config[key.replace("config_", "")] = value;
      } else {
        credentials[key] = value;
      }
    });

    const result = await createCredential({
      provider,
      name: "default",
      credentials,
      config: Object.keys(config).length > 0 ? config : undefined,
    });

    if (result.error) {
      throw new Error(result.error);
    }
  };

  const handleTestConnection = async (): Promise<boolean> => {
    const result = await testConnection(provider, "default");

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
    >
      {renderFormFields()}
    </IntegrationForm>
  );
}
