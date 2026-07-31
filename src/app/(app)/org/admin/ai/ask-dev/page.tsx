import { AskDevAdminPanel } from "@/components/admin/ask-dev/AskDevAdminPanel";
import { getAskDevAdmin, getAskDevUsage, updateAskDevAdminSettings } from "@/lib/admin/server";

export default function AskDevAISetupPage() {
    return (
        <AskDevAdminPanel
            loadAction={getAskDevAdmin}
            loadUsageAction={getAskDevUsage}
            saveAction={updateAskDevAdminSettings}
        />
    );
}
