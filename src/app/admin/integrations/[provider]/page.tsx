import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { IntegrationFormWrapper } from "./IntegrationFormWrapper";
import { listCredentials } from "@/lib/admin/server";
import type { IntegrationCredential } from "@/lib/admin/types";
import type { ConnectionStatusType } from "@/components/admin/integrations/ConnectionStatus";

const PROVIDERS: Record<string, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  jira: "Jira",
  linear: "Linear",
};

function getStatus(credential: IntegrationCredential | undefined): ConnectionStatusType {
  if (!credential) return "not_configured";
  if (credential.last_test_success === true) return "connected";
  if (credential.last_test_success === false) return "error";
  return "not_configured";
}

export default async function IntegrationPage({
  params,
}: {
  params: Promise<{ provider: string }>;
}) {
  const { provider } = await params;
  const providerName = PROVIDERS[provider];

  if (!providerName) {
    notFound();
  }

  const result = await listCredentials();
  const credentials = result.data ?? [];
  const credential = credentials.find((c) => c.provider === provider);

  return (
    <div>
      <AdminHeader
        title={`${providerName} Integration`}
        description={`Configure your ${providerName} connection settings.`}
      />

      {result.error && (
        <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-500">
          Failed to load credentials: {result.error}
        </div>
      )}

      <IntegrationFormWrapper
        provider={provider}
        providerName={providerName}
        initialStatus={getStatus(credential)}
        existingCredential={credential}
      />
    </div>
  );
}
