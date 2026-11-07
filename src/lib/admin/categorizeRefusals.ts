const MESSAGES: Record<string, string> = {
    purpose_not_configurable:
        "Categorization is not set up for this organization. Opt in first, then set its model.",
    provider_not_for_purpose: "This provider serves categorization only.",
    categorize_byo_model_unsupported: "The model must be clef or clef-flash.",
    invalid_base_url: "Enter the base URL of your Cloudflare account.",
    categorize_byo_unavailable: "Categorization on your own model is not available right now.",
    categorize_byo_optin_unreadable: "The opt-in could not be read. Try again.",
    categorize_byo_model_unreported: "The provider did not report which model answered.",
    categorize_byo_not_configured: "Save your own model configuration first.",
};

const TYPESAFE_MESSAGES: Record<string, string> = {
    categorize_byo_model_unsupported: "The model must be jev-1.13.0.",
    invalid_base_url: "TypeSafe takes no base URL.",
};

export function categorizeRefusalMessage(
    code: string | undefined,
    provider?: string,
): string | null {
    if (!code) return null;
    if (provider === "typesafe" && Object.hasOwn(TYPESAFE_MESSAGES, code)) {
        return TYPESAFE_MESSAGES[code];
    }
    return Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : null;
}
