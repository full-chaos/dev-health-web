import NextAuth, { CredentialsSignin } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import GitLab from "next-auth/providers/gitlab";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getBackendUrl } from "@/lib/origin";
import { logger } from "@/lib/logger";
import { getServerEnv } from "@/lib/config";
import { resolveActiveOrgId } from "@/lib/impersonation";

const authLogger = logger.child({ module: "auth" });

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

// Lazy secret: in production, pass undefined so Auth.js validates per-request
// instead of the old IIFE that threw at module-load and killed all exports.
const authEnv = getServerEnv();
const authSecret =
    authEnv.AUTH_SECRET ||
    authEnv.NEXTAUTH_SECRET ||
    (authEnv.NODE_ENV === "production" ? undefined : "dev-secret-change-in-production");

/**
 * Per-process micro-memo for the impersonation status poll (CHAOS-2328).
 *
 * The jwt callback runs on every session read — including the proxy, which
 * calls auth() for every protected route — so an unconditional backend fetch
 * per read would fan out badly on superuser traffic. The memo bounds it to
 * one fetch per ~3s per web process. `update()` triggers bypass the memo, so
 * explicit start/stop (which all impersonation components signal via
 * update({ impersonationChanged: true })) is observed with zero delay; the
 * worst-case cross-instance staleness is the memo TTL.
 *
 * Superuser sessions only — the map stays tiny; no eviction needed.
 */
interface ImpersonationStatusSnapshot {
    is_impersonating: boolean;
    impersonated_user_id?: string;
    impersonated_email?: string;
    impersonated_org_id?: string;
}
const impersonationStatusMemo = new Map<
    string,
    { at: number; status: ImpersonationStatusSnapshot }
>();
const IMPERSONATION_MEMO_TTL_MS = 3_000;

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
            authLogger.debug({ metadata }, message);
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
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    return null;
                }

                const backendUrl = getBackendUrl();
                try {
                    const res = await fetch(`${backendUrl}/api/v1/auth/login`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            email: credentials.email,
                            password: credentials.password,
                            org_id: credentials.org_id,
                        }),
                    });

                    if (res.status === 429) {
                        const contentType = res.headers.get("content-type") || "";
                        if (contentType.includes("application/json")) {
                            try {
                                const data = await res.json();
                                if (data?.detail?.retry_after_seconds) {
                                    throw new AccountLocked();
                                }
                            } catch (e) {
                                if (e instanceof AccountLocked) throw e;
                            }
                        }
                        throw new RateLimited();
                    }

                    const data = await res.json();

                    if (data?.status === "email_verification_required") {
                        throw new EmailVerificationRequired();
                    }

                    if (res.ok && data?.user) {
                        return {
                            id: data.user.id,
                            email: data.user.email,
                            org_id: data.user.org_id,
                            role: data.user.role,
                            is_superuser: data.user.is_superuser ?? false,
                            permissions: data.user.permissions,
                            needs_onboarding: data.needs_onboarding ?? false,
                            access_token: data.access_token,
                            refresh_token: data.refresh_token,
                            expires_in: data.expires_in,
                        };
                    }
                } catch (error) {
                    if (
                        error instanceof EmailVerificationRequired ||
                        error instanceof AccountLocked ||
                        error instanceof RateLimited
                    )
                        throw error;
                    authLogger.error({ err: error }, "credentials authorize failed");
                }

                return null;
            },
        }),
        ...(authEnv.AUTH_GITHUB_ID
            ? [
                  GitHub({
                      clientId: authEnv.AUTH_GITHUB_ID,
                      clientSecret: authEnv.AUTH_GITHUB_SECRET!,
                  }),
              ]
            : []),
        ...(authEnv.AUTH_GOOGLE_ID
            ? [
                  Google({
                      clientId: authEnv.AUTH_GOOGLE_ID,
                      clientSecret: authEnv.AUTH_GOOGLE_SECRET!,
                  }),
              ]
            : []),
        ...(authEnv.AUTH_GITLAB_ID
            ? [
                  GitLab({
                      clientId: authEnv.AUTH_GITLAB_ID,
                      clientSecret: authEnv.AUTH_GITLAB_SECRET!,
                  }),
              ]
            : []),
    ],
    callbacks: {
        async jwt({ token, user, account, trigger, session }) {
            if (user) {
                token.id = user.id;
                token.org_id = user.org_id;
                token.role = user.role;
                token.is_superuser = user.is_superuser;
                token.permissions = user.permissions;
                token.needs_onboarding = user.needs_onboarding;
                token.access_token = user.access_token;
                token.refresh_token = user.refresh_token;
                token.expires_at = Date.now() + (user.expires_in || 3600) * 1000;
                token.last_validated = Date.now();
                token.error = undefined;
            }

            // Social login: exchange OAuth token for backend JWT
            if (account && account.provider !== "credentials" && account.access_token) {
                try {
                    const backendUrl = getBackendUrl();
                    const res = await fetch(`${backendUrl}/api/v1/auth/social-login`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            provider: account.provider,
                            provider_access_token: account.access_token,
                        }),
                    });

                    if (res.ok) {
                        const data = await res.json();
                        token.id = data.user.id;
                        token.org_id = data.user.org_id || undefined;
                        token.role = data.user.role || undefined;
                        token.is_superuser = data.user.is_superuser || false;
                        token.permissions = [];
                        token.needs_onboarding = data.needs_onboarding ?? false;
                        token.access_token = data.access_token;
                        token.refresh_token = data.refresh_token;
                        token.expires_at = Date.now() + (data.expires_in || 3600) * 1000;
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

            // Handle onboarding completion
            if (trigger === "update" && session?.onboardComplete) {
                token.access_token = session.onboardComplete.access_token;
                token.refresh_token = session.onboardComplete.refresh_token;
                token.org_id = session.onboardComplete.org_id;
                token.role = session.onboardComplete.role;
                token.needs_onboarding = false;
                token.expires_at = Date.now() + (session.onboardComplete.expires_in || 3600) * 1000;
            }

            if (trigger === "update" && session?.activeOrg) {
                token.access_token = session.activeOrg.access_token;
                token.refresh_token = session.activeOrg.refresh_token;
                token.org_id = session.activeOrg.user.org_id;
                token.role = session.activeOrg.user.role;
                token.is_superuser = session.activeOrg.user.is_superuser ?? false;
                token.needs_onboarding = false;
                token.expires_at = Date.now() + (session.activeOrg.expires_in || 3600) * 1000;
                token.last_validated = Date.now();
                token.error = undefined;
            }

            const now = Date.now();
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
            if (tokenExpired && token.refresh_token) {
                try {
                    const backendUrl = getBackendUrl();
                    const res = await fetch(`${backendUrl}/api/v1/auth/refresh`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ refresh_token: token.refresh_token }),
                    });
                    if (res.ok) {
                        const data = await res.json();
                        token.access_token = data.access_token;
                        // NOTE: Single-use token rotation — if multiple concurrent JWT callbacks
                        // race (e.g., parallel SSR requests), a later callback may attempt to use
                        // an already-rotated refresh_token and receive a 401. The ?? fallback below
                        // preserves the most recently issued token if data.refresh_token is absent,
                        // but a brief window exists between concurrent rotations.
                        // Backend refresh grace shipped in CHAOS-2162 (PR #827); keep the client-side
                        // fallback so older/mixed backend deployments remain safe during rollouts.
                        token.refresh_token = data.refresh_token ?? token.refresh_token;
                        token.expires_at = now + (data.expires_in || 3600) * 1000;
                        token.last_validated = now;
                        token.refresh_failures = 0;
                        token.error = undefined;
                        if (data.user) {
                            token.id = data.user.id;
                            token.email = data.user.email;
                            token.org_id = data.user.org_id;
                            token.role = data.user.role;
                            token.is_superuser = data.user.is_superuser ?? false;
                        }
                    } else if (res.status === 401) {
                        token.access_token = undefined;
                        token.refresh_token = undefined;
                        token.error = "refresh_failed";
                        return token;
                    } else {
                        // 429/5xx/transient error — revoke access_token to prevent exposing an
                        // expired bearer token, but keep refresh_token so a later JWT callback can
                        // retry after full jittered exponential backoff (self-healing).
                        token.access_token = undefined;
                        const failures = ((token.refresh_failures as number | undefined) ?? 0) + 1;
                        token.refresh_failures = failures;
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
                } catch {
                    // Network error — revoke access_token to prevent exposing an expired bearer
                    // token, but keep refresh_token so a later JWT callback can retry after backoff.
                    token.access_token = undefined;
                    const failures = ((token.refresh_failures as number | undefined) ?? 0) + 1;
                    token.refresh_failures = failures;
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
            // shared Valkey cache server-side; the per-process memo above
            // bounds fetch fan-out, and update() triggers bypass it so
            // explicit start/stop is observed immediately. The update payload
            // itself is never trusted — only the server response mutates the
            // token.
            if (token.is_superuser && token.access_token && !user) {
                const memoKey = token.id as string;
                const memoized = impersonationStatusMemo.get(memoKey);
                const memoFresh =
                    memoized !== undefined && now - memoized.at < IMPERSONATION_MEMO_TTL_MS;
                if (memoFresh && trigger !== "update") {
                    token.is_impersonating = memoized.status.is_impersonating;
                    token.impersonated_user_id = memoized.status.impersonated_user_id;
                    token.impersonated_email = memoized.status.impersonated_email;
                    token.impersonated_org_id = memoized.status.impersonated_org_id;
                } else {
                    try {
                        const backendUrl = getBackendUrl();
                        const statusRes = await fetch(
                            `${backendUrl}/api/v1/admin/impersonate/status`,
                            {
                                method: "GET",
                                headers: {
                                    Authorization: `Bearer ${token.access_token as string}`,
                                },
                            },
                        );
                        if (statusRes.ok) {
                            const statusData = (await statusRes.json()) as {
                                is_impersonating: boolean;
                                target_user_id?: string | null;
                                target_email?: string | null;
                                target_org_id?: string | null;
                            };
                            const status: ImpersonationStatusSnapshot = {
                                is_impersonating: statusData.is_impersonating,
                                impersonated_user_id: statusData.target_user_id ?? undefined,
                                impersonated_email: statusData.target_email ?? undefined,
                                impersonated_org_id: statusData.target_org_id ?? undefined,
                            };
                            token.is_impersonating = status.is_impersonating;
                            token.impersonated_user_id = status.impersonated_user_id;
                            token.impersonated_email = status.impersonated_email;
                            token.impersonated_org_id = status.impersonated_org_id;
                            impersonationStatusMemo.set(memoKey, { at: now, status });
                        }
                    } catch {
                        // Network error — keep existing impersonation state and
                        // don't memo the failure (next read retries).
                    }
                }
            }

            // Step 2: Periodic backend validation — confirm user still exists in DB.
            // Only runs when token is NOT expired (fresh or just-refreshed).
            // Runs every 5 minutes, skips on initial login.
            const VALIDATION_INTERVAL = 5 * 60 * 1000;
            // On a failed validation attempt (429/5xx/network), use jittered
            // exponential backoff so repeated failures across tabs/instances spread
            // out and don't self-DOS the backend (CHAOS-2458).
            // Formula: delay = floor + Math.random() * (cappedDelay - floor)
            //   where cappedDelay = min(CAP, BASE * 2^(failures-1))
            // Full jitter across [floor, cappedDelay] — not upper-half only.
            const VALIDATION_BACKOFF_BASE = 60 * 1000; // 60 s
            const VALIDATION_BACKOFF_CAP = 15 * 60 * 1000; // 15 min
            const VALIDATION_BACKOFF_FLOOR = 5 * 1000; // 5 s minimum so next attempt isn't immediate
            if (
                !user &&
                token.access_token &&
                !token.error &&
                (!lastValidated || now - lastValidated > VALIDATION_INTERVAL)
            ) {
                try {
                    const backendUrl = getBackendUrl();
                    const res = await fetch(`${backendUrl}/api/v1/auth/validate`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ token: token.access_token }),
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (!data.valid) {
                            token.access_token = undefined;
                            token.refresh_token = undefined;
                            token.error = "user_invalid";
                            return token;
                        }
                        // Success — reset failure counter and stamp full interval.
                        token.last_validated = now;
                        token.validation_failures = 0;
                    } else if (res.status === 429 || res.status >= 500) {
                        // 429/5xx — transient; don't invalidate, retry after full
                        // jittered exponential backoff so concurrent tabs/instances spread out.
                        const failures =
                            ((token.validation_failures as number | undefined) ?? 0) + 1;
                        token.validation_failures = failures;
                        const cappedDelay = Math.min(
                            VALIDATION_BACKOFF_CAP,
                            VALIDATION_BACKOFF_BASE * Math.pow(2, failures - 1),
                        );
                        // Full jitter: spread across [floor, cappedDelay]
                        const jitteredDelay =
                            VALIDATION_BACKOFF_FLOOR +
                            Math.random() * (cappedDelay - VALIDATION_BACKOFF_FLOOR);
                        token.last_validated = now - VALIDATION_INTERVAL + jitteredDelay;
                    } else {
                        // Other 4xx (400/401/403/422) — the backend rejected the token
                        // outright; no backoff reprieve. Defense-in-depth: the endpoint
                        // normally signals bad tokens via 200 + valid:false.
                        token.access_token = undefined;
                        token.refresh_token = undefined;
                        token.error = "user_invalid";
                        return token;
                    }
                } catch {
                    // Network error — don't invalidate for transient failures,
                    // but back off with full jittered exponential delay instead of
                    // retrying on every request.
                    const failures = ((token.validation_failures as number | undefined) ?? 0) + 1;
                    token.validation_failures = failures;
                    const cappedDelay = Math.min(
                        VALIDATION_BACKOFF_CAP,
                        VALIDATION_BACKOFF_BASE * Math.pow(2, failures - 1),
                    );
                    // Full jitter: spread across [floor, cappedDelay]
                    const jitteredDelay =
                        VALIDATION_BACKOFF_FLOOR +
                        Math.random() * (cappedDelay - VALIDATION_BACKOFF_FLOOR);
                    token.last_validated = now - VALIDATION_INTERVAL + jitteredDelay;
                }
            }

            return token;
        },
        async session({ session, token }) {
            if (token) {
                session.user.id = token.id as string;
                session.user.is_impersonating = !!token.is_impersonating;
                session.user.impersonated_user_id = token.impersonated_user_id as
                    string | undefined;
                session.user.impersonated_email = token.impersonated_email as string | undefined;
                session.user.impersonated_org_id = token.impersonated_org_id as string | undefined;
                // org_id is the EFFECTIVE org: while impersonating it is the
                // impersonation target's org, so every consumer (proxy, GraphQL
                // providers, RSC fetchers) is impersonation-aware by construction.
                // Identity-semantic checks must read real_org_id instead.
                session.user.real_org_id = token.org_id as string | undefined;
                session.user.org_id = resolveActiveOrgId({
                    org_id: token.org_id as string | undefined,
                    is_impersonating: !!token.is_impersonating,
                    impersonated_org_id: token.impersonated_org_id as string | undefined,
                }) as string;
                session.user.role = token.role as string;
                session.user.is_superuser = (token.is_superuser as boolean) ?? false;
                session.user.permissions = token.permissions as string[];
                session.user.needs_onboarding = (token.needs_onboarding as boolean) ?? false;
                session.access_token = token.access_token as string;
                if (token.error) {
                    session.error = token.error as string;
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

import type { Session } from "next-auth";

// Per-request memoized session read. React.cache() dedupes calls within a
// single RSC render tree so auth()/requireSession()/requireRole()/
// requireSuperuser() share one next-auth read no matter how many server
// components or layouts invoke them. Safe because the module is server-only
// (no "use client" importers) and the getter has no side effects.
const getServerSession = cache(async (): Promise<Session | null> => {
    try {
        return await nextAuth.auth();
    } catch {
        return null;
    }
});

export async function auth(): Promise<Session | null> {
    const session = await getServerSession();
    if (!session?.access_token) return null;
    if (session.error) return null;
    return session;
}

export async function requireSession(callbackUrl?: string): Promise<Session> {
    const session = await getServerSession();
    // Transient backend outage: access_token revoked but refresh_token preserved for retry.
    // Redirect to /auth/error (not /auth/signin) — user is not hard-logged-out on a blip.
    if (session?.error === "refresh_unavailable") {
        redirect("/auth/error?error=refresh_unavailable");
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
    if (!session.user.is_superuser && !roleList.includes(session.user.role || "")) {
        redirect("/dashboard");
    }
    return session;
}

export async function requireSuperuser(callbackUrl?: string): Promise<Session> {
    const session = await requireSession(callbackUrl);
    if (session.user.is_superuser !== true) {
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
