import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireRole } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { getOrgEntitlements } from "@/lib/admin/server";

function orgAdminCallbackUrl(requestPath: string | null): string {
	if (!requestPath) return "/org/admin";
	return requestPath === "/org/admin" || requestPath.startsWith("/org/admin/")
		? requestPath
		: "/org/admin";
}

export default async function AdminLayout({
	children,
}: {
	children: React.ReactNode;
}) {
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

	return (
		<div className="min-h-screen">
			<div className="flex w-full flex-col gap-6 px-6 pb-20 pt-10 md:flex-row">
				<AdminSidebar isSuperuser={isSuperuser} features={features} />
				<AdminTierProvider tier={tier} features={features}>
					<main className="flex min-w-0 flex-1 flex-col gap-10">
						{children}
					</main>
				</AdminTierProvider>
			</div>
		</div>
	);
}
