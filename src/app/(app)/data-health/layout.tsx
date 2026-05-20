import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { getOrgEntitlements } from "@/lib/admin/server";

export default async function DataHealthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole(["admin", "owner", "operator"], "/data-health");

  const orgId = session.user.org_id;
  const entitlements = orgId ? await getOrgEntitlements(orgId) : null;
  const tier = entitlements?.data?.tier ?? "community";
  const features = entitlements?.data?.features ?? {};

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-20 pt-10">
        <AdminTierProvider tier={tier} features={features}>
          <main className="flex min-w-0 flex-1 flex-col gap-10">
            {children}
          </main>
        </AdminTierProvider>
      </div>
    </div>
  );
}
