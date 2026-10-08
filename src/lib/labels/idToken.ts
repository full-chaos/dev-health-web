const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const HEX_RUN = "[0-9a-f]{8,}";
const ID_TOKEN_RE = new RegExp(`(?<![0-9a-z])(?:${UUID}|${HEX_RUN})(?![0-9a-z])`, "i");

/**
 * True when `text` shows an ID where a name belongs: a UUID, a UUID prefix or
 * short token (`#a1b2c3d4`, `repo·a1b2c3d4`), or a long hash. Used by the label
 * contract tests; an ID may appear in a tooltip, never in the visible label.
 */
export function containsIdToken(text: string): boolean {
    return ID_TOKEN_RE.test(text);
}
