import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { IdentityTable } from "@/components/admin/identities/IdentityTable";
import { listIdentities } from "@/lib/admin/server";
import { CTA_LABELS } from "@/lib/design/cta";

export default async function IdentitiesPage() {
    const result = await listIdentities();

    return (
        <div>
            <AdminHeader
                title="Identities"
                description="Manage developer identities and map them to teams."
            >
                <Link
                    href="/org/admin/identities/new"
                    className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90"
                >
                    {CTA_LABELS.addIdentity}
                </Link>
            </AdminHeader>

            {result.error && (
                <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-500">
                    Failed to load identities: {result.error}
                </div>
            )}
            <IdentityTable
                identities={(result.data ?? []).map((i) => ({
                    canonical_id: i.canonical_id,
                    display_name: i.display_name,
                    email: i.email,
                    team_ids: i.team_ids,
                    provider_identities: i.provider_identities,
                }))}
            />
        </div>
    );
}
