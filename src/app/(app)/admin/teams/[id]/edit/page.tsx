import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { EditTeamFormWrapper } from "./EditTeamFormWrapper";
import { getTeam } from "@/lib/admin/server";

export default async function EditTeamPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const result = await getTeam(id);

    if (result.error || !result.data) {
        notFound();
    }

    const team = result.data;

    return (
        <div>
            <AdminHeader title="Edit Team" description={`Edit configuration for ${team.name}`} />
            <EditTeamFormWrapper team={team} />
        </div>
    );
}
