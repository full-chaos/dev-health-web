import { READ_FAILED_MESSAGE } from "@/lib/readFailure";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SettingsSection } from "@/components/admin/settings/SettingsSection";
import { OrgEditForm } from "@/components/superadmin/OrgEditForm";
import { OrgMembersManager } from "@/components/superadmin/OrgMembersManager";
import { OrgDeleteSection } from "@/components/superadmin/OrgDeleteSection";
import { getOrganization, listOrgMembers } from "@/lib/admin/server";

type PageProps = {
    params: Promise<{ id: string }>;
};

export default async function OrgDetailPage({ params }: PageProps) {
    const { id } = await params;
    const { data: org, error: orgError } = await getOrganization(id);
    const { data: members, error: membersError } = await listOrgMembers(id);

    if (orgError || !org) {
        notFound();
    }

    return (
        <div>
            <AdminHeader title={org.name} description={`Manage organization ${org.slug}`} />

            <SettingsSection
                title="Organization Settings"
                description="Update organization details and configuration."
            >
                <OrgEditForm org={org} />
            </SettingsSection>

            <SettingsSection
                title="Members"
                description="Users who are members of this organization."
            >
                {membersError ? (
                    <div className="text-(--negative)">
                        Error loading members. {READ_FAILED_MESSAGE}
                    </div>
                ) : (
                    <OrgMembersManager orgId={org.id} members={members ?? []} />
                )}
            </SettingsSection>

            <OrgDeleteSection orgId={org.id} orgSlug={org.slug} />
        </div>
    );
}
