import { redirect } from "next/navigation";

import { DeviceApprovalForm } from "@/components/acr/DeviceApprovalForm";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DeviceApprovalPage() {
    const session = await auth();
    if (!session?.access_token || !session.user.id || !session.user.org_id) {
        redirect("/auth/signin?callbackUrl=%2Facr%2Fdevice");
    }
    if (
        session.user.real_org_id !== undefined &&
        session.user.real_org_id !== session.user.org_id
    ) {
        return <DeviceApprovalForm initialState="denied" />;
    }
    return <DeviceApprovalForm />;
}
