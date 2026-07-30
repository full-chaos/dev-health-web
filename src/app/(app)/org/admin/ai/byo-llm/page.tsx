import { ByoLlmErrorStates } from "@/components/admin/llm/ByoLlmErrorStates";
import { ByoLlmSettings } from "@/components/admin/llm/ByoLlmSettings";
import { ByoLlmSpendSummary } from "@/components/admin/llm/ByoLlmSpendSummary";
import {
    deleteLLMSettings,
    getLLMBudget,
    getLLMSettings,
    getLLMSettingsStatus,
    getLLMSpendSummary,
    upsertLLMSettings,
} from "@/lib/admin/server";

export default function ByoLlmAISetupPage() {
    return (
        <div className="flex flex-col gap-8">
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
