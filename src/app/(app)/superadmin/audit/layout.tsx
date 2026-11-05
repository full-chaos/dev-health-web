import { requireSuperuser } from "@/lib/auth";

export default async function AuditLogLayout({ children }: { children: React.ReactNode }) {
    await requireSuperuser("/superadmin/audit", "page:/superadmin/audit");
    return children;
}
