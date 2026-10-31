import { AdminHeader } from "@/components/admin/AdminHeader";
import { AISetupTabs } from "@/components/admin/ai/AISetupTabs";
import { ByoLlmAiFeaturesToggle } from "@/components/admin/llm/ByoLlmAiFeaturesToggle";
import { ByoLlmOwnModelToggle } from "@/components/admin/llm/ByoLlmOwnModelToggle";
import { ByoLlmPromptCacheToggle } from "@/components/admin/llm/ByoLlmPromptCacheToggle";
import { ByoLlmErrorStates } from "@/components/admin/llm/ByoLlmErrorStates";
import { ByoLlmSettings } from "@/components/admin/llm/ByoLlmSettings";
import { ByoLlmCategorizeOptIn } from "@/components/admin/llm/ByoLlmCategorizeOptIn";
import { ByoLlmPurposeOverrides } from "@/components/admin/llm/ByoLlmPurposeOverrides";
import { ByoLlmSpendSummary } from "@/components/admin/llm/ByoLlmSpendSummary";
import {
    deleteLLMPurpose,
    deleteLLMSettings,
    getLLMBudget,
    getLLMSettings,
    getLLMSettingsStatus,
    getLLMSpendSummary,
    getOwnModelSetting,
    getPromptCacheSetting,
    getServiceModelSetting,
    runLLMSettingsReadiness,
    setOwnModelSetting,
    setPromptCacheSetting,
    setServiceModelSetting,
    upsertLLMPurpose,
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
                removePurposeAction={deleteLLMPurpose}
                runReadinessAction={runLLMSettingsReadiness}
                modelPicker
            />
            <ByoLlmOwnModelToggle loadAction={getOwnModelSetting} saveAction={setOwnModelSetting} />
            <ByoLlmPromptCacheToggle
                loadAction={getPromptCacheSetting}
                saveAction={setPromptCacheSetting}
            />
            <ByoLlmAiFeaturesToggle
                loadAction={getServiceModelSetting}
                saveAction={setServiceModelSetting}
            />
            <ByoLlmCategorizeOptIn
                loadSettingsAction={getLLMSettings}
                saveAction={upsertLLMSettings}
            />
            <ByoLlmPurposeOverrides
                loadSettingsAction={getLLMSettings}
                saveAction={upsertLLMPurpose}
                removeAction={deleteLLMPurpose}
            />
            <ByoLlmSpendSummary
                loadSpendAction={getLLMSpendSummary}
                loadBudgetAction={getLLMBudget}
            />
            <ByoLlmErrorStates />
        </div>
    );
}
