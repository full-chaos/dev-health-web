import { requireSuperuser } from "@/lib/auth";

export default async function NewPlatformUserLayout({ children }: { children: React.ReactNode }) {
    await requireSuperuser("/superadmin/users/new", "page:/superadmin/users/new");
    return children;
}
