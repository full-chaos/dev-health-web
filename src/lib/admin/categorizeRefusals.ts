/** A provider or base URL change must carry the API key again: a stored key never moves to a new target. */
export const TARGET_CHANGE_NEEDS_KEY_MESSAGE =
    "A new provider or base URL needs its API key entered again.";

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
    provider_or_base_url_change_requires_api_key: TARGET_CHANGE_NEEDS_KEY_MESSAGE,
};

export function categorizeRefusalMessage(code: string | undefined): string | null {
    return code && Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : null;
}
