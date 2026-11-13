import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { NextRequest } from "next/server";
import { getServerEnv } from "@/lib/config";
import { logger } from "@/lib/logger";

type AuthRouteHandler = (request: NextRequest) => Promise<Response>;

/** Which failed OAuth callback check refused the request. */
export type CallbackCheckRefusal = "InvalidCheck" | "StateMismatch";

/** The sign-in error a refused callback lands on; the sign-in page renders it (SocialLoginError). */
export const CALLBACK_REFUSAL_SIGNIN_ERROR = "social_login_failed";

// oauth4webapi's validateAuthResponse answers a callback state that is not the started one with these, under this
// code. Auth.js wraps that error as a CallbackRouteError, which it shows as Configuration. An "iss" mismatch carries
// the same code and is a real configuration fault, so the message must match exactly.
export const OAUTH_INVALID_RESPONSE = "OAUTH_INVALID_RESPONSE";
export const STATE_CHECK_MESSAGES: readonly string[] = [
    'unexpected "state" response parameter value',
    'response parameter "state" missing',
];

const CALLBACK_PATH = /^\/api\/auth\/callback\/[^/]+$/u;
const SESSION_COOKIE = /^(?:__Secure-)?authjs\.session-token(?:\.\d+)?=/u;

const log = logger.child({ module: "auth" });
const requests = new AsyncLocalStorage<{ refusal: CallbackCheckRefusal | null }>();

/**
 * Whether an Auth.js error is a failed callback check (a refused request), by the error's `type`: next-auth does not
 * export InvalidCheck, and @auth/core is not a direct dependency.
 */
export function callbackCheckRefusal(error: unknown): CallbackCheckRefusal | null {
    if (!(error instanceof Error)) return null;
    const type = (error as { type?: unknown }).type;
    if (type === "InvalidCheck") return "InvalidCheck";
    if (type !== "CallbackRouteError") return null;
    const cause = (error as { cause?: unknown }).cause;
    const inner =
        typeof cause === "object" && cause !== null ? (cause as { err?: unknown }).err : undefined;
    if (!(inner instanceof Error)) return null;
    if ((inner as { code?: unknown }).code !== OAUTH_INVALID_RESPONSE) return null;
    return STATE_CHECK_MESSAGES.includes(inner.message) ? "StateMismatch" : null;
}

/** Called by the Auth.js logger: marks the current route request when the error is a failed callback check. */
export function noteCallbackRefusal(error: unknown): void {
    const request = requests.getStore();
    if (!request) return;
    const refusal = callbackCheckRefusal(error);
    if (refusal) request.refusal = refusal;
}

// Behind a proxy the request URL is internal: Auth.js builds its redirects from the configured origin.
function authOrigin(request: NextRequest): string {
    const env = getServerEnv();
    const configured = env.AUTH_URL ?? env.NEXTAUTH_URL;
    if (configured !== undefined) {
        try {
            return new URL(configured).origin;
        } catch {
            // fall through to the request's own origin
        }
    }
    return new URL(request.url).origin;
}

/**
 * A callback whose state or PKCE check failed lands on the sign-in page with a sign-in error, not on the
 * Configuration page: the request was refused, the server is not misconfigured. Only when all hold: the request is
 * an OAuth callback, the Auth.js logger saw a failed check for this request, and Auth.js answered exactly the
 * Configuration redirect with no session cookie. Every other answer passes through unchanged, cookies included.
 */
export function authCallbackRefusal(handler: AuthRouteHandler): AuthRouteHandler {
    return async (request) => {
        const marks: { refusal: CallbackCheckRefusal | null } = { refusal: null };
        const response = await requests.run(marks, () => handler(request));
        if (marks.refusal === null || !CALLBACK_PATH.test(new URL(request.url).pathname))
            return response;
        const origin = authOrigin(request);
        if (response.headers.get("location") !== `${origin}/auth/error?error=Configuration`)
            return response;
        if (response.headers.getSetCookie().some((line) => SESSION_COOKIE.test(line)))
            return response;
        const headers = new Headers(response.headers);
        headers.set("location", `${origin}/auth/signin?error=${CALLBACK_REFUSAL_SIGNIN_ERROR}`);
        log.info(
            { refusal: marks.refusal },
            "oauth callback check failed; sent to the sign-in page",
        );
        return new Response(null, { status: response.status, headers });
    };
}

/** `authCallbackRefusal` for both methods of the Auth.js router. */
export function authCallbackRefusals(handlers: { GET: AuthRouteHandler; POST: AuthRouteHandler }): {
    GET: AuthRouteHandler;
    POST: AuthRouteHandler;
} {
    return { GET: authCallbackRefusal(handlers.GET), POST: authCallbackRefusal(handlers.POST) };
}
