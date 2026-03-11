import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SyncConfigForm } from "@/components/admin/sync/SyncConfigForm";
import { getSyncConfig, listCredentials } from "@/lib/admin/server";
import { RunBackfill } from "@/components/admin/sync/RunBackfill";

interface EditSyncConfigPageProps {
  params: Promise<{ configId: string }>;
}

export default async function EditSyncConfigPage({ params }: EditSyncConfigPageProps) {
  const { configId } = await params;
  const [configResult, credentialsResult] = await Promise.all([
    getSyncConfig(configId),
    listCredentials(),
  ]);

  if (configResult.error || !configResult.data) {
    notFound();
  }

  const config = configResult.data;
  const credentials = credentialsResult.data || [];

  return (
    <div className="space-y-6">
      <AdminHeader
        title={`Edit ${config.name}`}
        description="Update sync configuration settings."
      />

      <SyncConfigForm initialData={config} credentials={credentials} />

      <div className="max-w-2xl">
        <RunBackfill configId={configId} />
      </div>
    </div>
  );
}
