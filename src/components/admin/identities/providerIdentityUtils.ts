/**
 * Provider-identity row helpers for IdentityForm (CHAOS-2841 mapping-forms
 * lane): converting the `provider_identities` record to/from an editable row
 * list, and validating those rows before submit so an empty username or a
 * duplicate provider+username pair is caught with a user-safe message
 * instead of being silently dropped or double-submitted.
 */

export type ProviderEntry = { id: string; provider: string; username: string };

export const PROVIDERS = ["github", "gitlab", "jira", "email"];

export function recordToArray(record: Record<string, string[]>): ProviderEntry[] {
    return Object.entries(record).flatMap(([provider, usernames]) =>
        usernames.map((username, index) => ({
            id: `${provider}-${username}-${index}`,
            provider,
            username,
        })),
    );
}

export function arrayToRecord(entries: ProviderEntry[]): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    entries.forEach(({ provider, username }) => {
        const trimmed = username.trim();
        if (!trimmed) return;
        if (!result[provider]) result[provider] = [];
        result[provider].push(trimmed);
    });
    return result;
}

export type ProviderEntriesValidation = { ok: true } | { ok: false; message: string };

/**
 * Blocks submit on an empty username (rather than silently dropping the row)
 * or a case-insensitive duplicate provider+username pair, so a mistyped or
 * repeated mapping is caught before it reaches the backend.
 */
export function validateProviderEntries(entries: ProviderEntry[]): ProviderEntriesValidation {
    const seen = new Set<string>();

    for (const entry of entries) {
        const username = entry.username.trim();
        if (!username) {
            return {
                ok: false,
                message:
                    "Every provider identity needs a username — remove empty rows or fill them in.",
            };
        }

        const key = `${entry.provider.toLowerCase()}:${username.toLowerCase()}`;
        if (seen.has(key)) {
            return {
                ok: false,
                message: `Duplicate provider identity: "${username}" is already added for ${entry.provider}.`,
            };
        }
        seen.add(key);
    }

    return { ok: true };
}
