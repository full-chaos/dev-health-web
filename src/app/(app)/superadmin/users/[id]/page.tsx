import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SettingsSection } from "@/components/admin/settings/SettingsSection";
import { UserEditForm } from "@/components/superadmin/UserEditForm";
import { UserSetPasswordForm } from "@/components/superadmin/UserSetPasswordForm";
import { UserDeleteSection } from "@/components/superadmin/UserDeleteSection";
import { ImpersonateUserButton } from "@/components/admin/users/ImpersonateUserButton";
import { getUser } from "@/lib/admin/server";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function UserDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { data: user, error } = await getUser(id);

  if (error || !user) {
    notFound();
  }

  return (
    <div>
      <AdminHeader title={user.full_name || user.email} description={`Manage user ${user.email}`} />

      <SettingsSection title="User Profile" description="Update user details and configuration.">
        <UserEditForm user={user} />
      </SettingsSection>

      <SettingsSection title="Security" description="Manage user password and security settings.">
        <UserSetPasswordForm userId={user.id} />
      </SettingsSection>

      <SettingsSection
        title="Impersonation"
        description="Log in as this user to see what they see."
      >
        <ImpersonateUserButton user={user} />
      </SettingsSection>

      <UserDeleteSection userId={user.id} userEmail={user.email} />
    </div>
  );
}
