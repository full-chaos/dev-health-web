import { redirect } from "next/navigation";

import { DeviceApprovalForm } from "@/components/acr/DeviceApprovalForm";
import { DataState } from "@/components/ui/DataState";
import { auth } from "@/lib/auth";
import { listAuthorizedRepositories } from "@/lib/acr/service";

export const dynamic = "force-dynamic";

async function repositoryCatalog(orgId: string): Promise<readonly string[] | null> {
    try {
        return await listAuthorizedRepositories(orgId);
    } catch {
        return null;
    }
}

export default async function DeviceApprovalPage() {
    const session = await auth();
    if (!session?.access_token || !session.user.id || !session.user.org_id) {
        redirect("/auth/signin?callbackUrl=%2Facr%2Fdevice");
    }
    if (
        session.user.real_org_id !== undefined &&
        session.user.real_org_id !== session.user.org_id
    ) {
        return <DeviceApprovalForm initialState="denied" repositories={[]} />;
    }
    const repositories = await repositoryCatalog(session.user.org_id);
    if (repositories === null) {
        return (
            <main className="min-h-[100dvh] bg-background px-4 py-8 sm:px-6 sm:py-12">
                <DataState
                    description="Your repository access could not be loaded. Please return to your terminal and try again."
                    title="Approval is unavailable"
                    variant="error"
                />
            </main>
        );
    }
    return <DeviceApprovalForm repositories={repositories} />;
}
