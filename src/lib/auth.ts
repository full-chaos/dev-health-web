import NextAuth, { CredentialsSignin } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import GitHub from "next-auth/providers/github"
import Google from "next-auth/providers/google"
import GitLab from "next-auth/providers/gitlab"
import { redirect } from "next/navigation"
import { getBackendUrl } from "@/lib/origin"
import { logger } from "@/lib/logger"
import { getServerEnv } from "@/lib/config"

const authLogger = logger.child({ module: "auth" })

/**
 * Custom error thrown when login fails because the user's email
 * has not been verified yet.  NextAuth surfaces the `code` property
 * in the `SignInResponse` returned by `signIn({ redirect: false })`.
 */
class EmailVerificationRequired extends CredentialsSignin {
  code = "email_verification_required"
}

class AccountLocked extends CredentialsSignin {
  code = "account_locked"
}

class RateLimited extends CredentialsSignin {
  code = "rate_limited"
}

// Lazy secret: in production, pass undefined so Auth.js validates per-request
// instead of the old IIFE that threw at module-load and killed all exports.
const authEnv = getServerEnv()
const authSecret = authEnv.AUTH_SECRET
  || authEnv.NEXTAUTH_SECRET
  || (authEnv.NODE_ENV === "production"
    ? undefined
    : "dev-secret-change-in-production")

const nextAuth = NextAuth({
  trustHost: true,
  logger: {
    error: (error: Error) => { authLogger.error({ err: error }, "next-auth error") },
    warn: (code: string) => { authLogger.warn({ code }, "next-auth warning") },
    debug: (message: string, metadata?: unknown) => { authLogger.debug({ metadata }, message) },
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
          return null
        }

        const backendUrl = getBackendUrl()
        try {
          const res = await fetch(`${backendUrl}/api/v1/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
              org_id: credentials.org_id,
            }),
          })

          if (res.status === 429) {
            const contentType = res.headers.get("content-type") || ""
            if (contentType.includes("application/json")) {
              try {
                const data = await res.json()
                if (data?.detail?.retry_after_seconds) {
                  throw new AccountLocked()
                }
              } catch (e) {
                if (e instanceof AccountLocked) throw e
              }
            }
            throw new RateLimited()
          }

          const data = await res.json()

          if (data?.status === "email_verification_required") {
            throw new EmailVerificationRequired()
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
            }
          }
        } catch (error) {
          if (
            error instanceof EmailVerificationRequired ||
            error instanceof AccountLocked ||
            error instanceof RateLimited
          ) throw error
          authLogger.error({ err: error }, "credentials authorize failed")
        }

        return null
      },
    }),
    ...(authEnv.AUTH_GITHUB_ID ? [GitHub({ clientId: authEnv.AUTH_GITHUB_ID, clientSecret: authEnv.AUTH_GITHUB_SECRET! })] : []),
    ...(authEnv.AUTH_GOOGLE_ID ? [Google({ clientId: authEnv.AUTH_GOOGLE_ID, clientSecret: authEnv.AUTH_GOOGLE_SECRET! })] : []),
    ...(authEnv.AUTH_GITLAB_ID ? [GitLab({ clientId: authEnv.AUTH_GITLAB_ID, clientSecret: authEnv.AUTH_GITLAB_SECRET! })] : []),
  ],
  callbacks: {
    async jwt({ token, user, account, trigger, session }) {
      if (user) {
        token.id = user.id
        token.org_id = user.org_id
        token.role = user.role
        token.is_superuser = user.is_superuser
        token.permissions = user.permissions
        token.needs_onboarding = user.needs_onboarding
        token.access_token = user.access_token
        token.refresh_token = user.refresh_token
        token.expires_at = Date.now() + (user.expires_in || 3600) * 1000
        token.last_validated = Date.now()
      }

      // Social login: exchange OAuth token for backend JWT
      if (account && account.provider !== "credentials" && account.access_token) {
        try {
          const backendUrl = getBackendUrl()
          const res = await fetch(`${backendUrl}/api/v1/auth/social-login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: account.provider,
              provider_access_token: account.access_token,
            }),
          })

          if (res.ok) {
            const data = await res.json()
            token.id = data.user.id
            token.org_id = data.user.org_id || undefined
            token.role = data.user.role || undefined
            token.is_superuser = data.user.is_superuser || false
            token.permissions = []
            token.needs_onboarding = data.needs_onboarding ?? false
            token.access_token = data.access_token
            token.refresh_token = data.refresh_token
            token.expires_at = Date.now() + (data.expires_in || 3600) * 1000
            token.last_validated = Date.now()
          } else {
            const errorData = await res.json().catch((error) => {
              authLogger.warn({ err: error }, "failed to parse social login error response")
              return null
            })
            token.error = errorData?.detail?.message || errorData?.detail || "social_login_failed"
          }
        } catch (error) {
          authLogger.error({ err: error }, "social login backend call failed")
          token.error = "social_login_failed"
        }
      }

      // Handle onboarding completion
      if (trigger === "update" && session?.onboardComplete) {
        token.access_token = session.onboardComplete.access_token
        token.refresh_token = session.onboardComplete.refresh_token
        token.org_id = session.onboardComplete.org_id
        token.role = session.onboardComplete.role
        token.needs_onboarding = false
        token.expires_at = Date.now() + (session.onboardComplete.expires_in || 3600) * 1000
      }

      // For superusers: sync impersonation state from backend at most every 30s.
      // This ensures router.refresh() picks up the current impersonation state
      // without hammering the backend on every JWT callback.
      const now = Date.now()
      const IMPERSONATION_POLL_INTERVAL = 30 * 1000 // 30 seconds — matches backend cache TTL
      const lastImpersonationCheck = token.last_impersonation_check as number | undefined
      if (token.is_superuser && token.access_token && !user && (!lastImpersonationCheck || now - lastImpersonationCheck > IMPERSONATION_POLL_INTERVAL)) {
        try {
          const backendUrl = getBackendUrl()
          const statusRes = await fetch(`${backendUrl}/api/v1/admin/impersonate/status`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token.access_token as string}`,
            },
          })
          if (statusRes.ok) {
            const statusData = await statusRes.json() as { is_impersonating: boolean; target_user_id?: string | null }
            token.is_impersonating = statusData.is_impersonating
            token.impersonated_user_id = statusData.target_user_id ?? undefined
          }
        } catch {
          // Network error — keep existing impersonation state
        } finally {
          // Always rate-limit impersonation status checks, even on failures
          token.last_impersonation_check = now
        }
      }


      const expiresAt = token.expires_at as number | undefined
      const lastValidated = token.last_validated as number | undefined
      const tokenExpired = expiresAt && now > expiresAt - 5 * 60 * 1000

      // Step 1: Refresh expired tokens first (before validation).
      if (
        tokenExpired &&
        token.refresh_token
      ) {
        try {
          const backendUrl = getBackendUrl()
          const res = await fetch(`${backendUrl}/api/v1/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: token.refresh_token }),
          })
          if (res.ok) {
            const data = await res.json()
            token.access_token = data.access_token
            token.expires_at = now + (data.expires_in || 3600) * 1000
            token.last_validated = now
            if (data.user) {
              token.id = data.user.id
              token.email = data.user.email
              token.org_id = data.user.org_id
              token.role = data.user.role
              token.is_superuser = data.user.is_superuser ?? false
            }
          } else {
            token.access_token = undefined
            token.refresh_token = undefined
            token.error = "refresh_failed"
            return token
          }
        } catch {
          // Network error — keep existing token, retry on next request
        }
      }

      // Step 2: Periodic backend validation — confirm user still exists in DB.
      // Only runs when token is NOT expired (fresh or just-refreshed).
      // Runs every 5 minutes, skips on initial login.
      const VALIDATION_INTERVAL = 5 * 60 * 1000
      if (
        !user &&
        token.access_token &&
        !token.error &&
        (!lastValidated || now - lastValidated > VALIDATION_INTERVAL)
      ) {
        try {
          const backendUrl = getBackendUrl()
          const res = await fetch(`${backendUrl}/api/v1/auth/validate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: token.access_token }),
          })
          if (res.ok) {
            const data = await res.json()
            if (!data.valid) {
              token.access_token = undefined
              token.refresh_token = undefined
              token.error = "user_invalid"
              return token
            }
            token.last_validated = now
          }
        } catch {
          // Network error — don't invalidate for transient failures
        }
      }

      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.org_id = token.org_id as string
        session.user.role = token.role as string
        session.user.is_superuser = (token.is_superuser as boolean) ?? false
        session.user.permissions = token.permissions as string[]
        session.user.needs_onboarding = (token.needs_onboarding as boolean) ?? false
        session.access_token = token.access_token as string
        session.user.is_impersonating = !!token.is_impersonating
        session.user.impersonated_user_id = token.impersonated_user_id as string | undefined
        if (token.error) {
          session.error = token.error as string
        }
      }
      return session
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  secret: authSecret,
})

export const { handlers, signIn, signOut } = nextAuth

import type { Session } from "next-auth"

export async function auth(): Promise<Session | null> {
  try {
    const session = await nextAuth.auth()
    if (!session?.access_token) return null
    if (session.error) return null
    return session
  } catch {
    return null
  }
}

export async function requireSession(callbackUrl?: string): Promise<Session> {
  let session: Session | null = null
  try {
    session = await nextAuth.auth()
  } catch {
    session = null
  }
  // Surface social login errors (e.g. 409 account conflict) before dropping the session
  if (session?.error) {
    redirect(`/auth/signin?error=${encodeURIComponent(session.error)}`)
  }
  if (!session?.access_token || !session?.user) {
    redirect(callbackUrl ? `/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/auth/signin")
  }
  if (session.user.needs_onboarding) {
    redirect("/auth/onboard")
  }
  return session
}

export async function requireRole(roles: string | string[], callbackUrl?: string): Promise<Session> {
  const session = await requireSession(callbackUrl)
  const roleList = Array.isArray(roles) ? roles : [roles]
  if (!session.user.is_superuser && !roleList.includes(session.user.role || "")) {
    redirect("/dashboard")
  }
  return session
}

export async function requireSuperuser(callbackUrl?: string): Promise<Session> {
  const session = await requireSession(callbackUrl)
  if (session.user.is_superuser !== true) {
    redirect("/dashboard")
  }
  return session
}

export function getAvailableSocialProviders(): string[] {
  const env = getServerEnv()
  const providers: string[] = []
  if (env.AUTH_GITHUB_ID) providers.push("github")
  if (env.AUTH_GOOGLE_ID) providers.push("google")
  if (env.AUTH_GITLAB_ID) providers.push("gitlab")
  return providers
}
