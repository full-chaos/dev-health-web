/** The mail domain of a service account (reserved `.invalid` TLD: no login or SSO can reach it). */
export const SERVICE_ACCOUNT_DOMAIN = "service.dev-health.invalid";

/** The `auth_provider` value ops accepts for a service account. */
export const SERVICE_AUTH_PROVIDER = "service";

export const SERVICE_ACCOUNT_NAME_MAX = 64;

const NAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;

/** The address a service account gets from its name. */
export function serviceAccountEmail(name: string): string {
    return `${name.trim()}@${SERVICE_ACCOUNT_DOMAIN}`;
}

/** A plain-words problem with a name, or null when the name makes a valid local part. */
export function validateServiceAccountName(raw: string): string | null {
    const name = raw.trim();
    if (name.length === 0) return "Enter a name.";
    if (name.length > SERVICE_ACCOUNT_NAME_MAX) {
        return `Use at most ${SERVICE_ACCOUNT_NAME_MAX} characters.`;
    }
    if (!NAME_PATTERN.test(name)) {
        return "Use lowercase letters, digits, dots, hyphens and underscores. Start and end with a letter or digit.";
    }
    if (name.includes("..")) return "Do not use two dots in a row.";
    return null;
}

/** The one sentence for a name that is taken. */
export const SERVICE_ACCOUNT_EXISTS_MESSAGE = "A service account with this name already exists.";
