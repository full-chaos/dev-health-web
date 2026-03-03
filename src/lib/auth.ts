import NextAuth, { CredentialsSignin } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { redirect } from "next/navigation"
import { getBackendUrl } from "@/lib/origin"

/**
 * Custom error thrown when login fails because the user's email
 * has not been verified yet.  NextAuth surfaces the `code` property
 * in the `SignInResponse` returned by `signIn({ redirect: false })`.
 */
class EmailVerificationRequired extends CredentialsSignin {
  code = "email_verification_required"
}

const authSecret = process.env.AUTH_SECRET
  || process.env.NEXTAUTH_SECRET
  || (process.env.NODE_ENV === "production"
    ? (() => {
      throw new Error("AUTH_SECRET or NEXTAUTH_SECRET must be set in production")
    })()
    : "dev-secret-change-in-production")

const nextAuth = NextAuth({
  trustHost: true,
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

          const data = await res.json()

          // Backend returns { status: "email_verification_required" }
          // when the user's email has not been verified yet.
          if (data?.status === "email_verification_required") {
            throw new EmailVerificationRequired()
          }

          if (res.ok && data?.user) {
            // Return user object with tokens
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
          // Re-throw our custom error so NextAuth surfaces the code
          if (error instanceof EmailVerificationRequired) throw error
          console.error("Auth error:", error)
        }

        return null
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
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
    return session
  } catch {
    return null
  }
}

export async function requireSession(callbackUrl?: string): Promise<Session> {
  const session = await auth()
  if (!session?.user) {
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
