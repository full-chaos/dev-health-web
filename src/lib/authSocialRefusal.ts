import { appendCallbackUrl, safePostLoginRedirect } from "@/lib/post-login-redirect";

/** The sign-in error of a social sign-in that failed for any reason the page has no own text for. */
export const SOCIAL_LOGIN_FAILED = "social_login_failed";

// The backend's closed detail.reason values a social sign-in can answer (ops social.RefusalReasons, less
// the link and unlink values expired, principal_not_found and last_sign_in_method).
const SIGN_IN_REASONS = [
    "email_unverified",
    "identity_conflict",
    "signup_unavailable",
    "principal_deactivated",
    "invalid_credentials",
    "malformed",
    "dependency_unavailable",
] as const;

type SignInReason = (typeof SIGN_IN_REASONS)[number];

/** A sign-in page error code of a refused social sign-in (CHAOS-13756), prefixed as the sso_* codes. */
export type SocialRefusalCode = `social_${SignInReason}` | typeof SOCIAL_LOGIN_FAILED;

export const SOCIAL_REFUSAL_CODES: readonly SocialRefusalCode[] = [
    ...SIGN_IN_REASONS.map((reason): SocialRefusalCode => `social_${reason}`),
    SOCIAL_LOGIN_FAILED,
];

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The code of a refused social-login answer: the backend's detail.reason when it is one of the closed
 * sign-in values, else social_login_failed (no reason, as before the ops change; another value; a body
 * that is not a refusal object). Only a code reaches the URL, never the backend's text.
 */
export function classifySocialRefusal(status: number, body: unknown): SocialRefusalCode {
    if (status < 400) return SOCIAL_LOGIN_FAILED;
    const detail = isObject(body) && isObject(body.detail) ? body.detail : undefined;
    const reason = detail?.reason;
    if (typeof reason === "string" && (SIGN_IN_REASONS as readonly string[]).includes(reason)) {
        return `social_${reason as SignInReason}`;
    }
    return SOCIAL_LOGIN_FAILED;
}

/**
 * The local path of the sign-in's callbackUrl (the Auth.js callback-url cookie, an absolute URL) when it
 * is on host and a safe post-login target; undefined otherwise.
 */
export function sameOriginCallbackPath(
    raw: string | undefined,
    host: string | undefined,
): string | undefined {
    if (!raw || !host) return undefined;
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return undefined;
    }
    if (url.host !== host) return undefined;
    return safePostLoginRedirect(`${url.pathname}${url.search}${url.hash}`);
}

/** The sign-in page path a refused social sign-in lands on. */
export function refusedSocialSignInPath(code: SocialRefusalCode, callbackPath?: string): string {
    return appendCallbackUrl(`/auth/signin?error=${code}`, callbackPath);
}
