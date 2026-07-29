import { permanentRedirect } from "next/navigation";
import { getOrgEntitlements } from "@/lib/admin/server/billing";
import { requireSession } from "@/lib/auth";
import { fetchOrNull } from "@/lib/fetchOrNull";

type ContextPacketCompatibilityPageProps = {
    readonly searchParams?: Promise<{ readonly [key: string]: string | string[] | undefined }>;
};

/**
 * Compatibility alias for bookmarks created before Context Fabric validation
 * moved to its platform-admin home. Authorization remains owned by the target
 * route's superadmin layout; this alias never renders the validator itself.
 */
export default async function ContextPacketCompatibilityPage({
    searchParams,
}: ContextPacketCompatibilityPageProps) {
    const session = await requireSession();
    if (session.user.is_superuser !== true) {
        const entitlements = session.user.org_id
            ? await fetchOrNull(
                  getOrgEntitlements(session.user.org_id),
                  "context-packet-compatibility/entitlements",
              )
            : null;
        const askDevEnabled =
            entitlements?.data?.is_valid === true && entitlements.data.features.ask_dev === true;
        return permanentRedirect(askDevEnabled ? "/dev" : "/diagnose");
    }

    const params = await searchParams;
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
        if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
        else if (value !== undefined) query.set(key, value);
    }
    const suffix = query.size ? `?${query.toString()}` : "";
    permanentRedirect(`/superadmin/context-fabric/validation${suffix}`);
}
