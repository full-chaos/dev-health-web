import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { EditTeamFormWrapper } from "./EditTeamFormWrapper";
import { getTeam, listIdentities } from "@/lib/admin/server";

export default async function EditTeamPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const [result, identitiesResult] = await Promise.all([getTeam(id), listIdentities()]);

    if (result.error || !result.data) {
        notFound();
    }

    const team = result.data;
    const linkedIdentityCount = identitiesResult.data
        ? identitiesResult.data.filter((identity) => identity.team_ids.includes(team.team_id))
              .length
        : undefined;

    return (
        <div>
            <AdminHeader title="Edit Team" description={`Edit configuration for ${team.name}`} />
            <EditTeamFormWrapper team={team} linkedIdentityCount={linkedIdentityCount} />
        </div>
    );
}
