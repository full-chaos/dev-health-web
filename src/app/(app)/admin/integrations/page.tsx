import { AdminHeader } from "@/components/admin/AdminHeader";
import { IntegrationCard, IntegrationProvider } from "@/components/admin/integrations/IntegrationCard";
import { listCredentials } from "@/lib/admin/server";
import type { ConnectionStatusType } from "@/components/admin/integrations/ConnectionStatus";

const GitHubIcon = () => (
  <svg viewBox="0 0 24 24" className="h-8 w-8 fill-current text-gray-900 dark:text-gray-100">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
);

const GitLabIcon = () => (
  <svg viewBox="0 0 24 24" className="h-8 w-8 fill-current text-orange-600">
    <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.13-1.25.89.89 0 0 1 .1-.06L4.8 1.5a.71.71 0 0 1 .67-.48.72.72 0 0 1 .68.45L8.5 8.5h7l2.35-7.03a.72.72 0 0 1 .68-.45.71.71 0 0 1 .67.48l3.48 11.58a.86.86 0 0 1-.03 1.31z" />
  </svg>
);

const JiraIcon = () => (
  <svg viewBox="0 0 24 24" className="h-8 w-8 fill-current text-blue-600">
    <path d="M11.53 2c0-1.1 0.9-2 2-2h8.94c1.1 0 2 0.9 2 2v8.94c0 1.1-0.9 2-2 2h-8.94c-1.1 0-2-0.9-2-2v-8.94zM11.53 13.53c0-1.1 0.9-2 2-2h8.94c1.1 0 2 0.9 2 2v8.94c0 1.1-0.9 2-2 2h-8.94c-1.1 0-2-0.9-2-2v-8.94zM0 13.53c0-1.1 0.9-2 2-2h8.94c1.1 0 2 0.9 2 2v8.94c0 1.1-0.9 2-2 2h-8.94c-1.1 0-2-0.9-2-2v-8.94z" />
  </svg>
);

const LinearIcon = () => (
  <svg viewBox="0 0 24 24" className="h-8 w-8 fill-current text-indigo-600">
    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S16.627 0 12 0zm0 2.4c5.302 0 9.6 4.298 9.6 9.6 0 5.302-4.298 9.6-9.6 9.6-5.302 0-9.6-4.298-9.6-9.6 0-5.302 4.298-9.6 9.6-9.6zm-1.2 3.6v9.6h2.4V6h-2.4z" />
  </svg>
);

const PROVIDER_META: Record<
  string,
  { name: string; description: string; icon: React.ReactNode }
> = {
  github: {
    name: "GitHub",
    description: "Connect to GitHub to sync repositories, pull requests, and issues.",
    icon: <GitHubIcon />,
  },
  gitlab: {
    name: "GitLab",
    description: "Connect to GitLab to sync projects, merge requests, and issues.",
    icon: <GitLabIcon />,
  },
  jira: {
    name: "Jira",
    description: "Connect to Jira to sync issues, epics, and sprints.",
    icon: <JiraIcon />,
  },
  linear: {
    name: "Linear",
    description: "Connect to Linear to sync issues, cycles, and projects.",
    icon: <LinearIcon />,
  },
};

export default async function IntegrationsPage() {
  const result = await listCredentials();
  const credentials = result.data ?? [];

  const getStatus = (providerId: string): ConnectionStatusType => {
    const cred = credentials.find((c) => c.provider === providerId);
    if (!cred) return "not_configured";
    if (cred.last_test_success === true) return "connected";
    if (cred.last_test_success === false) return "error";
    return "connected";
  };

  const providers: IntegrationProvider[] = Object.entries(PROVIDER_META).map(
    ([id, meta]) => ({
      id,
      name: meta.name,
      description: meta.description,
      icon: meta.icon,
      status: getStatus(id),
    })
  );

  return (
    <div>
      <AdminHeader
        title="Integrations"
        description="Manage connections to external tools and services."
      />

      {result.error && (
        <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-500">
          Failed to load credentials: {result.error}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {providers.map((provider) => (
          <IntegrationCard key={provider.id} provider={provider} />
        ))}
      </div>
    </div>
  );
}
