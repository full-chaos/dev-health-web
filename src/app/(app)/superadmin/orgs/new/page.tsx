import { AdminHeader } from "@/components/admin/AdminHeader";
import { SettingsSection } from "@/components/admin/settings/SettingsSection";
import { OrgCreateForm } from "@/components/superadmin/OrgCreateForm";

export default function CreateOrgPage() {
  return (
    <div>
      <AdminHeader
        title="Create Organization"
        description="Create a new organization tenant."
      />
      <SettingsSection
        title="Organization Details"
        description="Enter the basic information for the new organization."
      >
        <OrgCreateForm />
      </SettingsSection>
    </div>
  );
}
