import { AskDevAdminPanel } from "@/components/admin/ask-dev/AskDevAdminPanel";
import {
    getAskDevAdmin,
    getAskDevUsage,
    runAskDevReadiness,
    updateAskDevAdminSettings,
} from "@/lib/admin/server";

export default function AskDevAISetupPage() {
    return (
        <AskDevAdminPanel
            loadAction={getAskDevAdmin}
            loadUsageAction={getAskDevUsage}
            saveAction={updateAskDevAdminSettings}
            readinessAction={runAskDevReadiness}
        />
    );
}
