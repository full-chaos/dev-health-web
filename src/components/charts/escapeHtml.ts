const HTML_ESCAPES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "`": "&#96;",
};

/**
 * Escape a served string for an ECharts tooltip formatter. ECharts assigns the formatter result
 * to innerHTML, so every name that comes from synced data must pass through here. Markup in a
 * formatter may come only from constants and the ECharts `marker`.
 */
export function escapeHtml(value: unknown): string {
    return String(value ?? "").replace(/[&<>"'`]/g, (ch) => HTML_ESCAPES[ch]);
}
