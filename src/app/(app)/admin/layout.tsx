import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { getCurrentOrg } from "@/lib/admin/server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole(["admin", "owner"], "/admin");

  const isSuperuser = session.user.is_superuser === true;

  if (isSuperuser && !session.user.org_id) {
    redirect("/superadmin");
  }

  const orgResult = await getCurrentOrg();
  const tier = orgResult.data?.tier ?? "community";

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-20 pt-10 md:flex-row">
        <AdminSidebar isSuperuser={isSuperuser} tier={tier} />
        <AdminTierProvider tier={tier}>
          <main className="flex min-w-0 flex-1 flex-col gap-10">
            {children}
          </main>
        </AdminTierProvider>
      </div>
    </div>
  );
}
