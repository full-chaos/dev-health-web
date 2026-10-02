import { AdminHeader } from "@/components/admin/AdminHeader";
import { AISetupTabs } from "@/components/admin/ai/AISetupTabs";
import { ByoLlmErrorStates } from "@/components/admin/llm/ByoLlmErrorStates";
import { ByoLlmSettings } from "@/components/admin/llm/ByoLlmSettings";
import { ByoLlmSpendSummary } from "@/components/admin/llm/ByoLlmSpendSummary";
import {
    deleteLLMSettings,
    getLLMBudget,
    getLLMSettings,
    getLLMSettingsStatus,
    getLLMSpendSummary,
    runLLMSettingsReadiness,
    upsertLLMSettings,
} from "@/lib/admin/server";

export default function ByoLlmAISetupPage() {
    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-6">
                <AdminHeader
                    title="AI Setup"
                    description="Manage organization-owned model provider settings."
                />
                <AISetupTabs />
            </div>
            <ByoLlmSettings
                loadSettingsAction={getLLMSettings}
                loadBudgetAction={getLLMBudget}
                loadStatusAction={getLLMSettingsStatus}
                saveSettingsAction={upsertLLMSettings}
                removeSettingsAction={deleteLLMSettings}
                runReadinessAction={runLLMSettingsReadiness}
            />
            <ByoLlmSpendSummary loadSpendAction={getLLMSpendSummary} />
            <ByoLlmErrorStates />
        </div>
    );
}
