import { PlatformAskDevReadinessPanel } from "@/components/admin/platform/PlatformAskDevReadinessPanel";
import { requireSuperuser } from "@/lib/auth";
import { getPlatformAskDevReadiness, runPlatformAskDevReadiness } from "@/lib/admin/server";

export default async function PlatformAskDevReadinessPage() {
    await requireSuperuser("/superadmin/ai/ask-dev");

    return (
        <PlatformAskDevReadinessPanel
            loadAction={getPlatformAskDevReadiness}
            runAction={runPlatformAskDevReadiness}
        />
    );
}
