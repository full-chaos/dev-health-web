import "server-only";
import NextAuth, { CredentialsSignin } from "next-auth";
import { decode, encode, getToken, type JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import GitLab from "next-auth/providers/gitlab";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { schedulePlatformShadow } from "@/lib/auth/platform/shadow";
import { getBackendUrl } from "@/lib/origin";
import { logger } from "@/lib/logger";
import { getClientIpFromEnv } from "@/lib/client-ip";
import { getServerEnv } from "@/lib/config";
import { resolveActiveOrgId } from "@/lib/impersonation";
import { applyBackendValidationMemo, VALIDATION_INTERVAL_MS } from "@/lib/authValidationMemo";
import { forgetImpersonationStatus, readImpersonationStatus } from "@/lib/impersonationStatusMemo";
import {
    admitPairWrite,
    clearHandoffUnconfirmed,
    confirmStartHandoff,
    clearImpersonationToken,
    delegatedExpired,
    delegatedToken,
    endImpersonationByHandoff,
    endImpersonationForSignOut,
    isImpersonatingToken,
    resolveImpersonationStep,
    setImpersonationToken,
    type ImpersonationPair,
} from "@/lib/impersonationToken";
import { deadlineFetch } from "@/lib/serverDeadline";
import { logSessionBranch, thrownErrorName } from "@/lib/authSessionLog";
import {
    passwordLogin,
    readExchangeAnswer,
    refreshSession,
    type RefreshResult,
    wireConfigFromEnv,
    wireConfigUsable,
} from "@/lib/authServiceWire";
import { ssoEnabled, type SsoSession } from "@/lib/authSso";

const authLogger = logger.child({ module: "auth" });

// The target's e-mail, from the status answer of the JWT callback run that returned the token, for
// the session of that same read only: it is not kept in the session cookie (CHAOS-13105 byte
// budget). No status answer in a run: the banner shows no address.
const targetEmailOfRun = new WeakMap<object, string>();

// No request reaches the jwt callback: read the incoming headers; outside a request scope send none.
async function refreshClientIp(): Promise<string | undefined> {
    try {
        return getClientIpFromEnv({ headers: await headers() });
    } catch {
        return undefined;
    }
}

/**
 * Custom error thrown when login fails because the user's email
 * has not been verified yet.  NextAuth surfaces the `code` property
 * in the `SignInResponse` returned by `signIn({ redirect: false })`.
 */
class EmailVerificationRequired extends CredentialsSignin {
    code = "email_verification_required";
}

class AccountLocked extends CredentialsSignin {
    code = "account_locked";
}

class RateLimited extends CredentialsSignin {
    code = "rate_limited";
}

class AuthUnavailable extends CredentialsSignin {
    code = "auth_unavailable";
}

// Lazy secret: outside development and test, pass undefined so Auth.js validates
// per-request instead of the old IIFE that threw at module-load and killed all exports.
const authEnv = getServerEnv();
const authSecret =
    authEnv.AUTH_SECRET ||
    authEnv.NEXTAUTH_SECRET ||
    (authEnv.NODE_ENV === "development" || authEnv.NODE_ENV === "test"
        ? "dev-secret-change-in-production"
        : undefined);

// The service session token, its expiry and the verified actor belong to the access token they
// were read with: every place that sets, replaces or drops the access token sets or drops them.
function setServiceToken(
    token: JWT,
    value: { token?: string; exp?: number; actor?: string },
): void {
    token.session_access_token = value.token;
    token.session_expires_at = value.exp === undefined ? undefined : value.exp * 1000;
    token.act_sub = value.actor;
}

// next-auth debug metadata has no fixed shape (provider config, tokens, profile, urls). Only key names and
// number or boolean values are logged: no string and no nested value.
function debugMetadataShape(metadata: unknown): Record<string, unknown> | undefined {
    if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
        return undefined;
    }
    const shape: Record<string, unknown> = { keys: Object.keys(metadata) };
    for (const [key, value] of Object.entries(metadata)) {
        if (typeof value === "number" || typeof value === "boolean") shape[key] = value;
    }
    return shape;
}

const nextAuth = NextAuth({
    trustHost: true,
    logger: {
        error: (error: Error) => {
            authLogger.error({ err: error }, "next-auth error");
        },
        warn: (code: string) => {
            authLogger.warn({ code }, "next-auth warning");
        },
        debug: (message: string, metadata?: unknown) => {
            authLogger.debug({ metadata: debugMetadataShape(metadata) }, message);
        },
    },
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
                org_id: { label: "Organization ID", type: "text" },
            },
            async authorize(credentials, request) {
                if (!credentials?.email || !credentials?.password) {
                    return null;
                }

                const env = getServerEnv();
                const login = await passwordLogin(
                    {
                        email: String(credentials.email),
                        password: String(credentials.password),
                        org_id:
                            typeof credentials.org_id === "string" ? credentials.org_id : undefined,
                    },
                    {
                        issuer: env.AUTH_ACCESS_TOKEN_ISSUER,
                        backendUrl: getBackendUrl(),
                        clientIp: request ? getClientIpFromEnv(request) : undefined,
                    },
                );
                switch (login.kind) {
                    case "email_verification_required":
                        throw new EmailVerificationRequired();
                    case "account_locked":
                        throw new AccountLocked();
                    case "rate_limited":
                        throw new RateLimited();
                    case "unavailable":
                        throw new AuthUnavailable();
                    case "invalid_credentials":
                        return null;
                    case "ok":
                        return {
                            id: login.user.id,
                            email: login.user.email,
                            org_id: login.user.orgId,
                            role: login.user.role,
                            is_superuser: login.user.isSuperuser,
                            needs_onboarding: login.needsOnboarding,
                            access_token: login.accessToken,
                            refresh_token: login.refreshToken,
                            expires_in: login.expiresIn,
                            access_exp: login.accessExp,
                            sid: login.sid,
                            session_access_token: login.sessionAccessToken,
                            session_exp: login.sessionExp,
                            act_sub: login.actorSub,
                        };
                }
            },
        }),
        CredentialsProvider({
            id: "sso",
            name: "SSO",
            credentials: { ticket: { label: "Ticket", type: "text" } },
            // Only a ticket this server sealed after a completed SSO call signs in: never raw tokens.
            async authorize(credentials) {
                if (!ssoEnabled()) return null;
                const session = await openSsoTicket(credentials?.ticket);
                if (!session) return null;
                return {
                    id: session.userId,
                    email: session.email,
                    org_id: session.orgId,
                    role: session.role,
                    is_superuser: false,
                    needs_onboarding: false,
                    access_token: session.accessToken,
                    refresh_token: session.refreshToken,
                    expires_in: session.expiresIn,
                    access_exp: session.accessExp,
                    sid: session.sid,
                    session_access_token: session.sessionAccessToken,
                    session_exp: session.sessionExp,
                    act_sub: session.actorSub,
                };
            },
        }),
        ...(authEnv.AUTH_GITHUB_ID
            ? [
                  GitHub({
                      clientId: authEnv.AUTH_GITHUB_ID,
                      clientSecret: authEnv.AUTH_GITHUB_SECRET!,
                      checks: ["pkce", "state"],
                  }),
              ]
            : []),
        ...(authEnv.AUTH_GOOGLE_ID
            ? [
                  Google({
                      clientId: authEnv.AUTH_GOOGLE_ID,
                      clientSecret: authEnv.AUTH_GOOGLE_SECRET!,
                      checks: ["pkce", "state"],
                  }),
              ]
            : []),
        ...(authEnv.AUTH_GITLAB_ID
            ? [
                  GitLab({
                      clientId: authEnv.AUTH_GITLAB_ID,
                      clientSecret: authEnv.AUTH_GITLAB_SECRET!,
                      checks: ["pkce", "state"],
                  }),
              ]
            : []),
    ],
    callbacks: {
        async jwt({ token, user, account, trigger, session }) {
            const now = Date.now();
            clearHandoffUnconfirmed(token);
            const refreshAdmin = async () => {
                const env = getServerEnv();
                return refreshSession(token.refresh_token as string, {
                    issuer: env.AUTH_ACCESS_TOKEN_ISSUER,
                    backendUrl: getBackendUrl(),
                    clientIp: await refreshClientIp(),
                });
            };
            const applyRotated = (refreshed: Extract<RefreshResult, { kind: "rotated" }>) => {
                // Single-use rotation: only the credential this answer carries is kept.
                token.access_token = refreshed.accessToken;
                token.refresh_token = refreshed.refreshToken;
                token.expires_at = refreshed.accessExp * 1000;
                token.sid = refreshed.sid;
                setServiceToken(token, {
                    token: refreshed.sessionAccessToken,
                    exp: refreshed.sessionExp,
                    actor: refreshed.actorSub,
                });
                token.last_validated = now;
                token.refresh_failures = 0;
                // A new access token starts with a clean validation count:
                // the count belongs to the token it replaces, and a stale
                // one keeps the next validation backoff at its cap.
                token.validation_failures = 0;
                token.error = undefined;
                if (refreshed.user) {
                    token.id = refreshed.user.id;
                    token.email = refreshed.user.email;
                    token.org_id = refreshed.user.orgId;
                    token.role = refreshed.user.role;
                    token.is_superuser = refreshed.user.isSuperuser;
                }
            };
            // The impersonation state step runs first and resolves before any branch below can
            // return: an expired delegated token is stopped with a live administrator bearer
            // (refreshed here when needed); a refresh outcome it got is reused, not fetched again.
            const step = await resolveImpersonationStep(token, now, {
                refresh: refreshAdmin,
                applyRotated,
            });
            if (step.kind === "ended") return token;
            if (step.kind === "stopped") forgetImpersonationStatus(token.id);

            // A new Ops token pair (workspace creation, org switch, password change) enters the
            // session only as a sealed handoff the server made (CHAOS-12088): the browser passes
            // it to update() and cannot read it. A plain `activeOrg` / `onboardComplete` payload is
            // refused by the HTTP route and ignored here. Before any pair is written, the
            // impersonation guard admits it.
            const handoff = admitPairWrite(
                token,
                trigger === "update"
                    ? await confirmStartHandoff(
                          token,
                          await openSessionHandoff(
                              (session as { sessionHandoff?: unknown } | undefined)?.sessionHandoff,
                              token.id as string | undefined,
                          ),
                      )
                    : null,
                Boolean(user || account),
            );
            if (user) {
                token.id = user.id;
                token.org_id = user.org_id;
                token.role = user.role;
                token.is_superuser = user.is_superuser;
                token.needs_onboarding = user.needs_onboarding;
                token.access_token = user.access_token;
                token.refresh_token = user.refresh_token;
                token.expires_at = user.access_exp
                    ? user.access_exp * 1000
                    : Date.now() + (user.expires_in || 3600) * 1000;
                token.sid = user.sid;
                setServiceToken(token, {
                    token: user.session_access_token,
                    exp: user.session_exp,
                    actor: user.act_sub,
                });
                token.last_validated = Date.now();
                token.error = undefined;
            }

            // Social login: exchange OAuth token for backend JWT
            const socialWire = wireConfigFromEnv();
            if (
                account &&
                account.provider !== "credentials" &&
                account.access_token &&
                !wireConfigUsable(socialWire, "social_login")
            ) {
                // A missing issuer is a configuration fault: no exchange is started.
                token.error = "social_login_failed";
            } else if (account && account.provider !== "credentials" && account.access_token) {
                try {
                    const backendUrl = getBackendUrl();
                    const res = await deadlineFetch("auth")(
                        `${backendUrl}/api/v1/auth/social-login`,
                        {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                provider: account.provider,
                                provider_access_token: account.access_token,
                            }),
                        },
                    );

                    const exchange = res.ok ? await res.json() : undefined;
                    const read = exchange
                        ? await readExchangeAnswer(
                              {
                                  accessToken:
                                      typeof exchange.access_token === "string"
                                          ? exchange.access_token
                                          : "",
                                  sessionAccessToken: exchange.session_access_token,
                              },
                              socialWire,
                              "social_login",
                          )
                        : undefined;
                    if (read?.kind === "refused" || read?.kind === "unavailable") {
                        // An answer that cannot be read is no sign-in.
                        token.error = "social_login_failed";
                    } else if (res.ok) {
                        const data = exchange;
                        token.id = data.user.id;
                        token.org_id = data.user.org_id || undefined;
                        token.role = data.user.role || undefined;
                        token.is_superuser = data.user.is_superuser || false;
                        token.needs_onboarding = data.needs_onboarding ?? false;
                        // Only the exchange response can say the account is new; a client update() never can.
                        token.is_new_user = data.is_new_user === true;
                        token.access_token = data.access_token;
                        token.refresh_token = data.refresh_token;
                        // The exchange sets a new access token: the old service token is not its pair.
                        setServiceToken(
                            token,
                            read?.kind === "read" && read.session.kind === "ok"
                                ? {
                                      token: read.session.token,
                                      exp: read.session.exp,
                                      actor:
                                          typeof read.actor === "string" ? read.actor : undefined,
                                  }
                                : {
                                      actor:
                                          read?.kind === "read" && typeof read.actor === "string"
                                              ? read.actor
                                              : undefined,
                                  },
                        );
                        if (read?.kind === "read" && read.sid !== undefined) token.sid = read.sid;
                        token.expires_at =
                            read?.kind === "read" && read.accessExp
                                ? read.accessExp * 1000
                                : Date.now() + (data.expires_in || 3600) * 1000;
                        token.last_validated = Date.now();
                    } else {
                        const errorData = await res.json().catch((error) => {
                            authLogger.warn(
                                { err: error },
                                "failed to parse social login error response",
                            );
                            return null;
                        });
                        token.error =
                            errorData?.detail?.message ||
                            errorData?.detail ||
                            "social_login_failed";
                    }
                } catch (error) {
                    authLogger.error({ err: error }, "social login backend call failed");
                    token.error = "social_login_failed";
                }
            }
            // A refused social sign-in is no session (CHAOS-13642): the token keeps the reason only,
            // nothing that names a user or carries a credential.
            if (
                account &&
                account.provider !== "credentials" &&
                account.access_token &&
                token.error
            ) {
                return { error: token.error } as JWT;
            }

            if (handoff?.kind === "onboardComplete") {
                const pair = handoff.pair as OnboardPair;
                token.access_token = pair.access_token;
                token.refresh_token = pair.refresh_token;
                // A pair of this kind holds no service token: the old one is not its pair.
                setServiceToken(token, {});
                token.org_id = pair.org_id;
                token.role = pair.role;
                token.needs_onboarding = false;
                token.expires_at = Date.now() + (pair.expires_in || 3600) * 1000;
            }

            if (handoff?.kind === "activeOrg") {
                const pair = handoff.pair as ActiveOrgPair;
                token.access_token = pair.access_token;
                token.refresh_token = pair.refresh_token;
                // The service token of the old pair is not this pair's: it is replaced by the
                // pair's own, or cleared when the pair has none (legacy pair).
                setServiceToken(token, {
                    token: pair.session_access_token,
                    exp: pair.session_exp,
                    actor: pair.act_sub,
                });
                if (pair.sid !== undefined) token.sid = pair.sid;
                token.org_id = pair.user.org_id;
                token.role = pair.user.role;
                token.is_superuser = pair.user.is_superuser ?? false;
                token.needs_onboarding = false;
                token.expires_at = pair.access_exp
                    ? pair.access_exp * 1000
                    : Date.now() + (pair.expires_in || 3600) * 1000;
                token.last_validated = Date.now();
                token.error = undefined;
            }

            if (handoff?.kind === "impersonation") {
                setImpersonationToken(token, handoff.pair as ImpersonationPair, Date.now());
            }
            // A stop the server recorded ends the impersonation it names, whatever the status read
            // then answers.
            if (handoff?.kind === "impersonationEnd") {
                endImpersonationByHandoff(
                    token,
                    (handoff.pair as { access_token: string }).access_token,
                );
            }

            const expiresAt = token.expires_at as number | undefined;
            const lastValidated = token.last_validated as number | undefined;
            const tokenExpired = expiresAt && now > expiresAt - 5 * 60 * 1000;

            // Step 1: Refresh expired tokens first (before validation).
            // On a failed refresh attempt (429/5xx/network), use the same
            // full-jitter exponential backoff shape as validation so repeated
            // failures across tabs/instances don't hammer the backend limiter.
            const REFRESH_BACKOFF_BASE = 60 * 1000; // 60 s
            const REFRESH_BACKOFF_CAP = 15 * 60 * 1000; // 15 min
            const REFRESH_BACKOFF_FLOOR = 5 * 1000; // 5 s minimum so next attempt isn't immediate
            const refreshed =
                step.kind !== "none" && step.refreshed
                    ? step.refreshed
                    : tokenExpired && token.refresh_token
                      ? await refreshAdmin()
                      : undefined;
            if (refreshed) {
                if (refreshed.kind === "rotated") {
                    applyRotated(refreshed);
                } else if (refreshed.kind === "terminal") {
                    // The authority refused the credential, or answered with something web
                    // refuses: both tokens go. The wire module logged the refused answers.
                    if (refreshed.reason === "status") {
                        logSessionBranch({
                            operation: "refresh",
                            branch: "refresh_failed",
                            status: refreshed.status,
                        });
                    }
                    // A delegated token still held is stopped with the old bearer while it lives.
                    await endImpersonationForSignOut(token, now);
                    token.access_token = undefined;
                    token.refresh_token = undefined;
                    setServiceToken(token, {});
                    token.error = "refresh_failed";
                    return token;
                } else {
                    // 429/5xx/network, or a refresh that could not be judged now: drop the access
                    // token (never expose an expired bearer), keep the refresh token so a later JWT
                    // callback retries after full jittered exponential backoff (self-healing). A
                    // credential the answer already rotated replaces the spent one.
                    token.access_token = undefined;
                    setServiceToken(token, {});
                    if (refreshed.refreshToken) token.refresh_token = refreshed.refreshToken;
                    const failures = ((token.refresh_failures as number | undefined) ?? 0) + 1;
                    token.refresh_failures = failures;
                    if (refreshed.status !== undefined) {
                        logSessionBranch({
                            operation: "refresh",
                            branch: "refresh_unavailable",
                            status: refreshed.status,
                            failures,
                        });
                    } else if (refreshed.errorName !== undefined) {
                        logSessionBranch({
                            operation: "refresh",
                            branch: "refresh_call_failed",
                            errorName: refreshed.errorName,
                            failures,
                        });
                    }
                    const cappedDelay = Math.min(
                        REFRESH_BACKOFF_CAP,
                        REFRESH_BACKOFF_BASE * Math.pow(2, failures - 1),
                    );
                    // Full jitter: spread across [floor, cappedDelay]
                    const jitteredDelay =
                        REFRESH_BACKOFF_FLOOR +
                        Math.random() * (cappedDelay - REFRESH_BACKOFF_FLOOR);
                    token.expires_at = now + 5 * 60 * 1000 + jitteredDelay;
                    token.error = "refresh_unavailable";
                    return token;
                }
            }

            // Impersonation sync for superusers (CHAOS-2328). Runs AFTER the
            // refresh step so a just-refreshed access token is used — polling
            // before refresh could 401 and silently keep stale impersonation
            // state for this request. The status endpoint reads through a
            // shared Valkey cache server-side. `readImpersonationStatus` keeps
            // the answer for 3 s per user and per process, and callers that
            // arrive together share one backend read (CHAOS-9218). update()
            // triggers always read again, so explicit start/stop is observed
            // immediately. The update payload itself is never trusted — only
            // the server response mutates the token.
            if (token.is_superuser && token.access_token && !user) {
                const status = await readImpersonationStatus({
                    userId: token.id,
                    accessToken: token.access_token as string,
                    force: trigger === "update",
                    now,
                });
                // The state is the delegated token (isImpersonatingToken); this read never starts
                // it. `undefined` (the read failed, or failed a moment ago) or an answer without a
                // boolean `is_impersonating` changes nothing. A read with the administrator bearer
                // that says false ends it; true refreshes the display data of a held token only.
                if (status?.is_impersonating === false) {
                    clearImpersonationToken(token);
                    token.impersonated_user_id = undefined;
                    token.impersonated_email = undefined;
                    token.impersonated_org_id = undefined;
                } else if (status?.is_impersonating === true && isImpersonatingToken(token)) {
                    token.impersonated_user_id = status.impersonated_user_id;
                    token.impersonated_email = undefined;
                    if (status.impersonated_email) {
                        targetEmailOfRun.set(token, status.impersonated_email);
                    }
                    token.impersonated_org_id = status.impersonated_org_id;
                }
            }

            // Step 2: Periodic backend validation — confirm user still exists in DB.
            // Only runs when token is NOT expired (fresh or just-refreshed).
            // Runs every VALIDATION_INTERVAL_MS, skips on initial login.
            if (
                !user &&
                token.access_token &&
                !token.error &&
                (!lastValidated || now - lastValidated >= VALIDATION_INTERVAL_MS)
            ) {
                await applyBackendValidationMemo(token, now);
            }

            return token;
        },
        async session({ session, token }) {
            // A token with no user is a refused sign-in: the session names no user (CHAOS-13642).
            if (token && !token.id) return { expires: session.expires, error: token.error };
            if (token) {
                // Computed here from the delegated token on every read; never stored (D6720).
                const impersonating = isImpersonatingToken(token);
                session.user.id = token.id as string;
                session.user.is_impersonating = impersonating;
                session.user.impersonated_user_id = impersonating
                    ? (token.impersonated_user_id as string | undefined)
                    : undefined;
                session.user.impersonated_email = impersonating
                    ? targetEmailOfRun.get(token)
                    : undefined;
                session.user.impersonated_org_id = impersonating
                    ? (token.impersonated_org_id as string | undefined)
                    : undefined;
                // org_id is the EFFECTIVE org: while impersonating it is the
                // impersonation target's org, so every consumer (proxy, GraphQL
                // providers, RSC fetchers) is impersonation-aware by construction.
                // Identity-semantic checks must read real_org_id instead.
                session.user.real_org_id = token.org_id as string | undefined;
                session.user.org_id = resolveActiveOrgId({
                    org_id: token.org_id as string | undefined,
                    is_impersonating: impersonating,
                    impersonated_org_id: session.user.impersonated_org_id,
                }) as string;
                session.user.role = token.role as string;
                session.user.is_superuser = (token.is_superuser as boolean) ?? false;
                session.user.needs_onboarding = (token.needs_onboarding as boolean) ?? false;
                session.user.is_new_user = token.is_new_user === true;
                // While a delegated token is set it is the session token (an expired one is refused
                // by the backend: never a fall back to the administrator's). The administrator's
                // own token goes aside for stop and status.
                const delegated = delegatedToken(token);
                if (impersonating && delegatedExpired(token, Date.now())) {
                    // The stop has not succeeded yet: no bearer at all (neither the expired
                    // delegated token nor the administrator's under the impersonated view). Data
                    // calls fail closed; the next JWT callback retries the stop.
                    session.access_token = undefined;
                    session.session_access_token = undefined;
                    session.error = (token.error as string | undefined) ?? "impersonation_ending";
                } else {
                    session.access_token = (delegated ?? token.access_token) as string;
                    // In-process only: the HTTP session answer drops them (authBrowserSession).
                    // The actor is never put on the session. While impersonating there is no
                    // service token: the delegated one is not kept (cookie byte budget,
                    // CHAOS-13105), and the auth-service routes refuse a pair change then anyway.
                    session.session_access_token = delegated
                        ? undefined
                        : (token.session_access_token as string | undefined);
                    if (delegated)
                        session.admin_access_token = token.access_token as string | undefined;
                    if (token.error) {
                        session.error = token.error as string;
                    }
                }
            }
            return session;
        },
    },
    pages: {
        signIn: "/auth/signin",
        error: "/auth/error",
    },
    secret: authSecret,
});

export const { handlers, signIn, signOut } = nextAuth;

/** Salt of the session-handoff key (HKDF from the auth secret); never the session cookie salt. */
export const SESSION_HANDOFF_SALT = "dev-health.session-handoff.v1";
/** A handoff is used at once by the page that received it; a short life bounds a copied one. */
const SESSION_HANDOFF_MAX_AGE_SECONDS = 120;

export type SessionHandoffKind =
    "activeOrg" | "onboardComplete" | "impersonation" | "impersonationEnd";

type OnboardPair = {
    access_token: string;
    refresh_token?: string;
    org_id?: string;
    role?: string;
    expires_in?: number;
};

type ActiveOrgPair = {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    // The route read the answer: the verified access expiry and session id, the verified actor, and
    // the service token with its expiry (CHAOS-10876).
    access_exp?: number;
    sid?: string;
    act_sub?: string;
    session_access_token?: string;
    session_exp?: number;
    user: { org_id?: string; role?: string; is_superuser?: boolean };
};

/**
 * Seals a new Ops token pair for the signed-in user (CHAOS-12088). The result is an encrypted JWT
 * (the auth secret, its own salt, 120 s, bound to the user id): the page passes it to
 * `useSession().update({ sessionHandoff })` and cannot read it. The update goes through the page's
 * own session channel, so a session read the page started earlier cannot write the old session
 * back over the new one.
 */
export async function sealSessionHandoff(
    kind: SessionHandoffKind,
    pair: OnboardPair | ActiveOrgPair | ImpersonationPair,
    userId: string,
): Promise<string> {
    if (!authSecret) throw new Error("no auth secret to seal a session handoff");
    if (!userId) throw new Error("no user id to bind a session handoff to");
    return encode({
        secret: authSecret,
        salt: SESSION_HANDOFF_SALT,
        maxAge: SESSION_HANDOFF_MAX_AGE_SECONDS,
        // The seal time in ms makes a start handoff one-use (admitPairWrite).
        token: { sub: userId, kind, pair, issued_ms: Date.now() },
    });
}

/** Salt of the SSO ticket key (HKDF from the auth secret); never the session cookie or handoff salt. */
export const SSO_TICKET_SALT = "dev-health.sso-ticket.v1";
const SSO_TICKET_MAX_AGE_SECONDS = 60;

/**
 * Seals the session of a completed SSO call (CHAOS-10878): an encrypted JWT (the auth secret, its
 * own salt, 60 s, bound to the user id) that the server passes to `signIn("sso", { ticket })`. The
 * tokens in it never reach the browser.
 */
export async function sealSsoTicket(session: SsoSession): Promise<string> {
    if (!authSecret) throw new Error("no auth secret to seal an SSO ticket");
    if (!session.userId) throw new Error("no user id to bind an SSO ticket to");
    return encode({
        secret: authSecret,
        salt: SSO_TICKET_SALT,
        maxAge: SSO_TICKET_MAX_AGE_SECONDS,
        token: { sub: session.userId, kind: "sso", session },
    });
}

async function openSsoTicket(value: unknown): Promise<SsoSession | null> {
    const refuse = (reason: string) => {
        authLogger.warn({ reason }, "sso ticket refused");
        return null;
    };
    if (typeof value !== "string" || !value) return refuse("not_a_string");
    if (!authSecret) return refuse("no_secret");
    let payload: Record<string, unknown> | null;
    try {
        payload = (await decode({
            secret: authSecret,
            salt: SSO_TICKET_SALT,
            token: value,
        })) as Record<string, unknown> | null;
    } catch (error) {
        authLogger.warn(
            { reason: "unreadable_or_expired", errorName: thrownErrorName(error) },
            "sso ticket refused",
        );
        return null;
    }
    if (!payload) return refuse("empty");
    const session = payload.session as Record<string, unknown> | undefined;
    if (payload.kind !== "sso" || !session || typeof session !== "object") return refuse("not_sso");
    const text = (v: unknown) => typeof v === "string" && v !== "";
    const optText = (v: unknown) => v === undefined || text(v);
    const optNumber = (v: unknown) =>
        v === undefined || (typeof v === "number" && Number.isFinite(v));
    if (
        !text(session.userId) ||
        payload.sub !== session.userId ||
        !text(session.orgId) ||
        !text(session.accessToken) ||
        !text(session.refreshToken) ||
        !optText(session.email) ||
        !optText(session.role) ||
        !optText(session.sid) ||
        !optText(session.sessionAccessToken) ||
        !optText(session.actorSub) ||
        !optNumber(session.expiresIn) ||
        !optNumber(session.accessExp) ||
        !optNumber(session.sessionExp)
    ) {
        return refuse("bad_session");
    }
    return session as unknown as SsoSession;
}

// The service fields of a pair, when present: strings that are not empty and finite numbers.
function validServiceFields(pair: Record<string, unknown>): boolean {
    const text = (v: unknown) => v === undefined || (typeof v === "string" && v !== "");
    const number = (v: unknown) => v === undefined || (typeof v === "number" && Number.isFinite(v));
    return (
        text(pair.session_access_token) &&
        text(pair.sid) &&
        text(pair.act_sub) &&
        number(pair.session_exp) &&
        number(pair.access_exp)
    );
}

async function openSessionHandoff(
    value: unknown,
    userId: string | undefined,
): Promise<{ kind: SessionHandoffKind; pair: unknown; issued_ms: unknown } | null> {
    if (value === undefined) return null;
    const refuse = (reason: string) => {
        authLogger.warn({ reason, userId }, "session handoff refused");
        return null;
    };
    if (typeof value !== "string" || !value) return refuse("not_a_string");
    if (!authSecret || !userId) return refuse("no_secret_or_user");
    let payload: Record<string, unknown> | null;
    try {
        payload = (await decode({
            secret: authSecret,
            salt: SESSION_HANDOFF_SALT,
            token: value,
        })) as Record<string, unknown> | null;
    } catch (error) {
        authLogger.warn(
            { reason: "unreadable_or_expired", errorName: thrownErrorName(error), userId },
            "session handoff refused",
        );
        return null;
    }
    if (!payload) return refuse("empty");
    if (payload.sub !== userId) return refuse("other_user");
    const kind = payload.kind;
    if (
        kind !== "activeOrg" &&
        kind !== "onboardComplete" &&
        kind !== "impersonation" &&
        kind !== "impersonationEnd"
    ) {
        return refuse("unknown_kind");
    }
    const pair = payload.pair as { access_token?: unknown; user?: unknown } | undefined;
    if (!pair || typeof pair.access_token !== "string" || !pair.access_token) {
        return refuse("no_access_token");
    }
    if (kind === "activeOrg" && (!pair.user || typeof pair.user !== "object")) {
        return refuse("no_user");
    }
    if (!validServiceFields(pair as Record<string, unknown>)) return refuse("bad_service_fields");
    if (kind === "impersonation") {
        const expiresIn = (pair as { expires_in?: unknown }).expires_in;
        if (expiresIn !== undefined && (typeof expiresIn !== "number" || !(expiresIn > 0))) {
            return refuse("bad_expires_in");
        }
        const handoffId = (pair as { handoff_id?: unknown }).handoff_id;
        if (typeof handoffId !== "string" || !handoffId) return refuse("no_handoff_id");
    }
    return { kind, pair, issued_ms: payload.issued_ms };
}

import type { Session } from "next-auth";
import { IMPERSONATION_DENY_PATH, impersonationLimited } from "@/lib/auth/platform/limits";

// Per-request memoized session read. React.cache() dedupes calls within a
// single RSC render tree so auth()/requireSession()/requireRole()/
// requireSuperuser() share one next-auth read no matter how many server
// components or layouts invoke them. Safe because the module is server-only
// (`import "server-only"`: a client import fails the build) and the getter has
// no side effects.
const getServerSession = cache(async (): Promise<Session | null> => {
    try {
        return await nextAuth.auth();
    } catch {
        return null;
    }
});

/**
 * For the actions that start or stop an impersonation: drops the kept impersonation status of
 * the signed-in user, so the next session read of that user asks the backend again (CHAOS-9218).
 */
export async function forgetOwnImpersonationStatus(): Promise<void> {
    const session = await getServerSession();
    forgetImpersonationStatus(session?.user?.id);
}

export async function auth(): Promise<Session | null> {
    const session = await getServerSession();
    if (!session?.access_token) return null;
    if (session.error) return null;
    return session;
}

/** The session cookie names Auth.js uses: the `__Secure-` one on https, the plain one on http. */
const SESSION_COOKIE_NAMES = ["__Secure-authjs.session-token", "authjs.session-token"] as const;

/**
 * The Ops tokens of the signed-in session, for sign-out only (CHAOS-12096: the Ops logout revokes
 * the session its refresh token belongs to). Read from the sealed session cookie of the request
 * and nothing else: an `Authorization` header is never read, and no refresh runs (a refresh would
 * rotate the credential the logout names). `null` unless the cookie is one this server sealed and
 * holds both tokens. Never log the result.
 */
export async function readSessionCredentialsForSignOut(request: Request): Promise<{
    readonly access_token: string;
    readonly refresh_token: string;
    readonly user_id?: string;
    /** Stops a held impersonation with the administrator bearer; a failed stop is logged. */
    readonly endImpersonation: () => Promise<void>;
} | null> {
    const cookie = request.headers.get("cookie");
    if (!authSecret || !cookie) return null;
    const req = { headers: new Headers({ cookie }) };
    for (const cookieName of SESSION_COOKIE_NAMES) {
        const token = await getToken({
            cookieName,
            req,
            secret: authSecret,
            secureCookie: cookieName.startsWith("__Secure-"),
        }).catch((error: unknown) => {
            authLogger.warn(
                { cookieName, errorName: thrownErrorName(error) },
                "sign-out: the session cookie could not be read",
            );
            return null;
        });
        if (!token) continue;
        const { access_token: accessToken, refresh_token: refreshToken } = token;
        if (typeof accessToken !== "string" || accessToken === "") return null;
        if (typeof refreshToken !== "string" || refreshToken === "") return null;
        return {
            access_token: accessToken,
            refresh_token: refreshToken,
            ...(typeof token.id === "string" ? { user_id: token.id } : {}),
            endImpersonation: () => endImpersonationForSignOut(token, Date.now()),
        };
    }
    return null;
}

export async function requireSession(callbackUrl?: string): Promise<Session> {
    const session = await getServerSession();
    // Transient backend outage: access_token revoked but refresh_token preserved for retry.
    // Redirect to /auth/error (not /auth/signin) — user is not hard-logged-out on a blip.
    if (session?.error === "refresh_unavailable") {
        redirect("/auth/error?error=refresh_unavailable");
    }
    // An impersonation whose stop is not yet recorded: no data, the next request retries it.
    if (session?.error === "impersonation_ending") {
        redirect("/auth/error?error=impersonation_ending");
    }
    // Terminal errors (social login failure, user invalidated, refresh_failed, etc.)
    if (session?.error) {
        redirect(`/auth/signin?error=${encodeURIComponent(session.error)}`);
    }
    if (!session?.access_token || !session?.user) {
        redirect(
            callbackUrl
                ? `/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`
                : "/auth/signin",
        );
    }
    if (session.user.needs_onboarding) {
        redirect("/auth/onboard");
    }
    return session;
}

export async function requireRole(
    roles: string | string[],
    callbackUrl?: string,
): Promise<Session> {
    const session = await requireSession(callbackUrl);
    const roleList = Array.isArray(roles) ? roles : [roles];
    const superuserBypass =
        session.user.is_superuser === true && session.user.is_impersonating !== true;
    if (!superuserBypass && !roleList.includes(session.user.role || "")) {
        redirect("/dashboard");
    }
    return session;
}

export async function requireSuperuser(callbackUrl?: string, surfaceId?: string): Promise<Session> {
    const session = await requireSession(callbackUrl);
    if (surfaceId) schedulePlatformShadow(session, [surfaceId]);
    // Enforce only: a deny page instead of the silent redirect. Off and shadow never reach it.
    if (await impersonationLimited(session)) redirect(IMPERSONATION_DENY_PATH);
    if (session.user.is_superuser !== true || session.user.is_impersonating === true) {
        redirect("/dashboard");
    }
    return session;
}

export function getAvailableSocialProviders(): string[] {
    const env = getServerEnv();
    const providers: string[] = [];
    if (env.AUTH_GITHUB_ID) providers.push("github");
    if (env.AUTH_GOOGLE_ID) providers.push("google");
    if (env.AUTH_GITLAB_ID) providers.push("gitlab");
    return providers;
}
