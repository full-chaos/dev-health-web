/** The two sentences that refuse an SSO write for an impersonating session: the web guard's and go-api's. */
export const IMPERSONATION_REFUSALS: readonly string[] = [
    "Not available while impersonating",
    "Not allowed in an impersonation session",
];

export function isImpersonationRefusal(text: string | undefined | null): text is string {
    return typeof text === "string" && IMPERSONATION_REFUSALS.includes(text);
}
