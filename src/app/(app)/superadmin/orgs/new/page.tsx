import { AdminHeader } from "@/components/admin/AdminHeader";
import { SettingsSection } from "@/components/admin/settings/SettingsSection";
import { OrgCreateForm } from "@/components/superadmin/OrgCreateForm";
import { requireSuperuser } from "@/lib/auth";

export default async function CreateOrgPage() {
    await requireSuperuser("/superadmin/orgs/new", "page:/superadmin/orgs/new");
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
