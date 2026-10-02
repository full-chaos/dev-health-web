import { AdminHeader } from "@/components/admin/AdminHeader";

import { AuditClientPage } from "./AuditClientPage";
import { getAuditLog } from "./actions";

export default async function BillingAuditPage() {
    const initial = await getAuditLog({ limit: 50, offset: 0 });
    const initialEntries = initial.data?.items ?? [];

    return (
        <div className="space-y-4">
            <AdminHeader title="Billing Audit" />
            <AuditClientPage initialEntries={initialEntries} />
        </div>
    );
}
