// Plain-language names for the scopes acr can put on an OAuth consent or a
// device grant. One table for both approval forms.
export const ACR_SCOPE_LABELS: Readonly<Record<string, string>> = {
    "context:read": "Read agent context",
    "data:read": "Run direct data operations",
    "evidence:read": "Read source evidence",
};

export const UNKNOWN_SCOPE_LABEL = "Other access not described here";

export function scopeLabel(scope: string): string {
    return Object.hasOwn(ACR_SCOPE_LABELS, scope) ? ACR_SCOPE_LABELS[scope] : UNKNOWN_SCOPE_LABEL;
}

export function isKnownScope(scope: string): boolean {
    return Object.hasOwn(ACR_SCOPE_LABELS, scope);
}
