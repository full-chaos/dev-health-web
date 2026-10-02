import { requireRole } from "@/lib/auth";
import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { getOrgEntitlements } from "@/lib/admin/server";

export default async function DataHealthLayout({ children }: { children: React.ReactNode }) {
    const session = await requireRole(["admin", "owner", "operator"], "/data-health");

    const orgId = session.user.org_id;
    const entitlements = orgId ? await getOrgEntitlements(orgId) : null;
    const tier = entitlements?.data?.tier ?? "community";
    const features = entitlements?.data?.features ?? {};

    // Rendered inside the shared app shell: the shell owns the navigation, the page padding and
    // the `<main>` landmark. Each page's header brings the Data Confidence tab row.
    return (
        <AdminTierProvider tier={tier} features={features}>
            <div className="flex min-w-0 flex-1 flex-col gap-10">{children}</div>
        </AdminTierProvider>
    );
}
