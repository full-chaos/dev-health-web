import { ByoLlmSettings } from "@/components/admin/llm/ByoLlmSettings";
import { ByoLlmErrorStates } from "@/components/admin/llm/ByoLlmErrorStates";
import {
    getLLMSettings,
    getLLMSettingsStatus,
    upsertLLMSettings,
    deleteLLMSettings,
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
            <ByoLlmSettings
                loadSettingsAction={getLLMSettings}
                loadStatusAction={getLLMSettingsStatus}
                saveSettingsAction={upsertLLMSettings}
                removeSettingsAction={deleteLLMSettings}
            />
            <ByoLlmErrorStates />
        </div>
    );
}
