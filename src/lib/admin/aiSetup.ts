export const AI_SETUP_PATHS = {
    byoLlm: "/org/admin/ai/byo-llm",
} as const;

export type AISetupTabId = "byo-llm";

export type AISetupFeatureDecisions = Readonly<Partial<Record<"byo_llm", boolean>>>;

export const AI_SETUP_TABS = [
    {
        id: "byo-llm",
        label: "BYO LLM",
        path: AI_SETUP_PATHS.byoLlm,
        feature: "byo_llm",
    },
] as const;

export function visibleAISetupTabs(features: AISetupFeatureDecisions) {
    return AI_SETUP_TABS.filter((tab) => features[tab.feature] === true).map((tab) => ({
        id: tab.id,
        label: tab.label,
        path: tab.path,
        navVisible: true,
    }));
}

export function resolveAISetupDefaultPath(features: AISetupFeatureDecisions): string {
    if (features.byo_llm === true) return AI_SETUP_PATHS.byoLlm;
    return "/org/admin";
}

export function activeAISetupTab(pathname: string): AISetupTabId | undefined {
    return AI_SETUP_TABS.find((tab) => pathname === tab.path)?.id;
}
