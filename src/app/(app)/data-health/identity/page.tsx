import { AdminHeader } from "@/components/admin/AdminHeader";

import { IdentityGapsTable } from "../_components/IdentityGapsTable";

export default function DataHealthIdentityPage() {
    return (
        <div className="space-y-8">
            <AdminHeader
                title="Identity Health"
                description="Review unmapped identities from connectors and manually confirm suggested aliases."
            />

            <IdentityGapsTable />
        </div>
    );
}
