import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { getBackendUrl } from "@/lib/origin"

const authSecret = process.env.AUTH_SECRET 
  || process.env.NEXTAUTH_SECRET 
  || "dev-secret-change-in-production"

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

          if (res.ok && data) {
            // Return user object with tokens
            return {
              id: data.user.id,
              email: data.user.email,
              org_id: data.user.org_id,
              role: data.user.role,
              is_superuser: data.user.is_superuser ?? false,
              permissions: data.user.permissions,
              access_token: data.access_token,
              refresh_token: data.refresh_token,
              expires_in: data.expires_in,
            }
          }
        } catch (error) {
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
        token.access_token = user.access_token
        token.refresh_token = user.refresh_token
        token.expires_at = Date.now() + (user.expires_in || 3600) * 1000
      }

      // Handle impersonation start
      if (trigger === "update" && session?.startImpersonation) {
        // Store real admin state
        token.real_access_token = token.access_token
        token.real_user_id = token.id
        token.real_role = token.role
        token.real_org_id = token.org_id
        // Swap to impersonated state
        token.access_token = session.startImpersonation.access_token
        token.id = session.startImpersonation.impersonated_user.id
        token.role = session.startImpersonation.impersonated_user.role
        token.org_id = session.startImpersonation.impersonated_user.org_id
        token.is_impersonating = true
        token.impersonated_user_id = session.startImpersonation.impersonated_user.id
      }
      
      // Handle impersonation stop
      if (trigger === "update" && session?.stopImpersonation) {
        token.access_token = session.stopImpersonation.access_token
        token.id = token.real_user_id
        token.role = token.real_role
        token.org_id = token.real_org_id
        token.is_impersonating = false
        token.impersonated_user_id = undefined
        token.real_access_token = undefined
        token.real_user_id = undefined
        token.real_role = undefined
        token.real_org_id = undefined
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
        session.access_token = token.access_token as string
        session.user.is_impersonating = !!token.is_impersonating
        session.user.impersonated_user_id = token.impersonated_user_id as string | undefined
        session.user.real_user_id = token.real_user_id as string | undefined
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
    return await nextAuth.auth()
  } catch {
    return null
  }
}
