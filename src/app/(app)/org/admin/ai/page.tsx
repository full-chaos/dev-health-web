import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getOrgEntitlements } from "@/lib/admin/server";
import { resolveAISetupDefaultPath } from "@/lib/admin/aiSetup";

export default async function AISetupPage() {
    const session = await requireRole(["admin", "owner"], "/org/admin/ai");
    const orgId = session.user.org_id;

    if (session.user.is_superuser === true && !orgId) {
        return redirect("/superadmin");
    }
    if (!orgId) return redirect("/org/admin");

    const entitlements = await getOrgEntitlements(orgId);
    redirect(resolveAISetupDefaultPath(entitlements.data?.features ?? {}));
}
