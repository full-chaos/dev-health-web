import { requireSuperuser } from "@/lib/auth";
import { SuperadminSidebar } from "@/components/superadmin/SuperadminSidebar";

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
    const session = await requireSuperuser("/superadmin");
    const hasOrgAccess =
        !!session.user.org_id && (session.user.role === "admin" || session.user.role === "owner");

    return (
        <div className="min-h-screen">
            <div className="flex w-full flex-col gap-6 px-6 pb-20 pt-10 md:flex-row">
                <SuperadminSidebar canAccessOrgAdmin={hasOrgAccess} />
                <main className="flex min-w-0 flex-1 flex-col gap-10">{children}</main>
            </div>
        </div>
    );
}
