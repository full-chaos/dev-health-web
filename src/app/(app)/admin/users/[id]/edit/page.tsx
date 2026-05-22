import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { EditUserFormWrapper } from "./EditUserFormWrapper";
import { getUser } from "@/lib/admin/server";

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getUser(id);

  if (result.error || !result.data) {
    notFound();
  }

  const user = result.data;

  return (
    <div className="max-w-2xl">
      <AdminHeader
        title="Edit User"
        description={`Update details for ${user.full_name || user.email}`}
      />
      <EditUserFormWrapper user={user} />
    </div>
  );
}
