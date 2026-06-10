import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SettingsSection } from "@/components/admin/settings/SettingsSection";
import { OrgEditForm } from "@/components/superadmin/OrgEditForm";
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
                    <div className="text-red-500">Error loading members: {membersError}</div>
                ) : (
                    <div className="overflow-x-auto rounded-lg border border-(--card-stroke)">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-(--card-70) text-(--ink-muted)">
                                <tr>
                                    <th className="px-4 py-3 font-medium">User ID</th>
                                    <th className="px-4 py-3 font-medium">Role</th>
                                    <th className="px-4 py-3 font-medium">Joined</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-(--card-stroke)">
                                {members?.map((member) => (
                                    <tr key={member.id}>
                                        <td className="px-4 py-3 font-mono text-xs">
                                            {member.user_id}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="inline-flex items-center rounded-full bg-(--accent)/10 px-2 py-0.5 text-xs font-medium text-(--accent)">
                                                {member.role}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-(--ink-muted)">
                                            {member.joined_at
                                                ? new Date(member.joined_at).toLocaleDateString()
                                                : "-"}
                                        </td>
                                    </tr>
                                ))}
                                {members?.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={3}
                                            className="px-4 py-8 text-center text-(--ink-muted)"
                                        >
                                            No members found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </SettingsSection>

            <OrgDeleteSection orgId={org.id} orgSlug={org.slug} />
        </div>
    );
}
