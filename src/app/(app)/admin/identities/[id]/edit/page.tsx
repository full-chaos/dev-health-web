import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { EditIdentityFormWrapper } from "./EditIdentityFormWrapper";
import { getIdentity, listTeams } from "@/lib/admin/server";

export default async function EditIdentityPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const [identityResult, teamsResult] = await Promise.all([getIdentity(id), listTeams()]);

    if (identityResult.error || !identityResult.data) {
        notFound();
    }

    const identity = identityResult.data;
    const teams = (teamsResult.data ?? []).map((t) => ({
        team_id: t.team_id,
        name: t.name,
        description: t.description,
        repo_patterns: t.repo_patterns,
        project_keys: t.project_keys,
    }));

    return (
        <div>
            <AdminHeader
                title="Edit Identity"
                description={`Edit configuration for ${identity.display_name || identity.canonical_id}`}
            />
            <EditIdentityFormWrapper identity={identity} teams={teams} />
        </div>
    );
}
