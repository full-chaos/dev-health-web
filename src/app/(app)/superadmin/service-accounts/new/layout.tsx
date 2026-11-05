import { requireSuperuser } from "@/lib/auth";

export default async function NewServiceAccountLayout({ children }: { children: React.ReactNode }) {
    await requireSuperuser(
        "/superadmin/service-accounts/new",
        "page:/superadmin/service-accounts/new",
    );
    return children;
}
