import React from "react";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { IntegrationForm } from "@/components/admin/integrations/IntegrationForm";
import {
  GitHubForm,
  GitLabForm,
  JiraForm,
  LinearForm,
} from "@/components/admin/integrations/ProviderForms";

// Mock function to simulate saving data
async function saveIntegration(data: any) {
  "use server";
  console.log("Saving integration data:", data);
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

// Mock function to simulate testing connection
async function testConnection(data: any) {
  "use server";
  console.log("Testing connection with data:", data);
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 1500));
  // Randomly succeed or fail for demo purposes
  return Math.random() > 0.3;
}

export default async function IntegrationPage({
  params,
}: {
  params: Promise<{ provider: string }>;
}) {
  const { provider } = await params;

  const providers: Record<string, string> = {
    github: "GitHub",
    gitlab: "GitLab",
    jira: "Jira",
    linear: "Linear",
  };

  const providerName = providers[provider];

  if (!providerName) {
    notFound();
  }

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
    <div>
      <AdminHeader
        title={`${providerName} Integration`}
        description={`Configure your ${providerName} connection settings.`}
      />

      <IntegrationForm
        providerName={providerName}
        initialStatus="not_configured"
        onSave={saveIntegration}
        onTestConnection={testConnection}
      >
        {renderFormFields()}
      </IntegrationForm>
    </div>
  );
}
