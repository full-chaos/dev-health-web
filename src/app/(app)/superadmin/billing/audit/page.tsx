import { AuditClientPage } from "./AuditClientPage";
import { getAuditLog } from "./actions";

export default async function BillingAuditPage() {
    const initial = await getAuditLog({ limit: 50, offset: 0 });
    const initialEntries = initial.data?.items ?? [];

    return <AuditClientPage initialEntries={initialEntries} />;
}
