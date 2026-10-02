import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireRole } from "@/lib/auth";
import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { getOrgEntitlements } from "@/lib/admin/server";

function orgAdminCallbackUrl(requestPath: string | null): string {
    if (!requestPath) return "/org/admin";
    return requestPath === "/org/admin" || requestPath.startsWith("/org/admin/")
        ? requestPath
        : "/org/admin";
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const requestHeaders = await headers();
    const session = await requireRole(
        ["admin", "owner"],
        orgAdminCallbackUrl(requestHeaders.get("x-dev-health-path")),
    );

    const isSuperuser = session.user.is_superuser === true;

    if (isSuperuser && !session.user.org_id) {
        redirect("/superadmin");
    }

    const orgId = session.user.org_id;
    const entitlements = orgId ? await getOrgEntitlements(orgId) : null;
    const tier = entitlements?.data?.tier ?? "community";
    const features = entitlements?.data?.features ?? {};

    // Rendered inside the shared app shell: the shell owns the navigation, the page padding and
    // the `<main>` landmark. Each page's header brings the tab row of its Admin destination.
    // The platform admin flag for the tab rows comes from the authed app layout (one source).
    return (
        <AdminTierProvider tier={tier} features={features}>
            <div className="flex min-w-0 flex-1 flex-col gap-10">{children}</div>
        </AdminTierProvider>
    );
}
