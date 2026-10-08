const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const HEX_RUN = "[0-9a-f]{8,}";
const PROVIDERS = "jira|gh|gl|github|gitlab|linear|ms-teams|bitbucket|ado|azure|pagerduty|opsgenie";
const PROVIDER_KEYED_RE = new RegExp(`(?<![0-9a-z])(?:${PROVIDERS}):[^\\s]`, "i");
const ID_TOKEN_RE = new RegExp(`(?<![0-9a-z])(?:${UUID}|${HEX_RUN})(?![0-9a-z])`, "i");

/**
 * True when `text` shows an ID where a name belongs: a UUID, a UUID prefix or
 * short token (`#a1b2c3d4`, `repo·a1b2c3d4`), or a long hash. Used by the label
 * contract tests; an ID may appear in a tooltip, never in the visible label.
 */
export function containsIdToken(text: string): boolean {
    return ID_TOKEN_RE.test(text) || PROVIDER_KEYED_RE.test(text);
}

/** True for a provider-keyed id such as `jira:<uuid>`, `gh:<slug>`, `linear:<id>`. */
export function isProviderKeyedId(text: string): boolean {
    return new RegExp(`^(?:${PROVIDERS}):\\S`, "i").test(text.trim());
}
