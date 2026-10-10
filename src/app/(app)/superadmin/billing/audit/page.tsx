import { AdminHeader } from "@/components/admin/AdminHeader";

import { AuditClientPage } from "./AuditClientPage";
import { boundedRead } from "@/lib/serverDeadline";
import { getAuditLog } from "./actions";

export default async function BillingAuditPage() {
    const initial = await boundedRead(getAuditLog({ limit: 50, offset: 0 }), "step billing audit");
    const initialEntries = initial.data?.items ?? [];

    return (
        <div className="space-y-4">
            <AdminHeader title="Billing Audit" />
            <AuditClientPage initialEntries={initialEntries} />
        </div>
    );
}
