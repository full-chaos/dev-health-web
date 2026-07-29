import { ByoLlmSettings } from "@/components/admin/llm/ByoLlmSettings";
import { ByoLlmErrorStates } from "@/components/admin/llm/ByoLlmErrorStates";
import { ByoLlmSpendSummary } from "@/components/admin/llm/ByoLlmSpendSummary";
import { AskDevAdminPanel } from "@/components/admin/ask-dev/AskDevAdminPanel";
import {
    getLLMSettings,
    getLLMSettingsStatus,
    getLLMBudget,
    upsertLLMSettings,
    deleteLLMSettings,
    getLLMSpendSummary,
    getAskDevAdmin,
    getAskDevUsage,
    updateAskDevAdminSettings,
    runAskDevReadiness,
} from "@/lib/admin/server";

// Bring Your Own LLM (BYO-LLM) org-admin settings page. Sits inside
// (app)/org/admin so it inherits the AdminSidebar + AdminTierProvider and the
// requireRole(["admin","owner"]) guard from the admin layout. The page is a thin
// server component that injects the real server actions into the client form;
// tier/flag gating (402/403) is enforced server-side and surfaced as a locked
// state by the form itself.
export default function ByoLlmAdminPage() {
    return (
        <div className="flex flex-col gap-8">
            <AskDevAdminPanel
                loadAction={getAskDevAdmin}
                loadUsageAction={getAskDevUsage}
                saveAction={updateAskDevAdminSettings}
                readinessAction={runAskDevReadiness}
            />
            <ByoLlmSettings
                loadSettingsAction={getLLMSettings}
                loadBudgetAction={getLLMBudget}
                loadStatusAction={getLLMSettingsStatus}
                saveSettingsAction={upsertLLMSettings}
                removeSettingsAction={deleteLLMSettings}
            />
            <ByoLlmSpendSummary loadSpendAction={getLLMSpendSummary} />
            <ByoLlmErrorStates />
        </div>
    );
}
