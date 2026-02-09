import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SyncConfigForm } from "@/components/admin/sync/SyncConfigForm";
import { getSyncConfig, listCredentials } from "@/lib/admin/server";

interface EditSyncConfigPageProps {
  params: {
    configId: string;
  };
}

export default async function EditSyncConfigPage({ params }: EditSyncConfigPageProps) {
  const [configResult, credentialsResult] = await Promise.all([
    getSyncConfig(params.configId),
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
    </div>
  );
}
