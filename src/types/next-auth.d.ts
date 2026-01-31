import NextAuth, { DefaultSession } from "next-auth"
import { JWT } from "next-auth/jwt"

declare module "next-auth" {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    user: {
      id: string
      org_id?: string
      role?: string
      permissions?: string[]
    } & DefaultSession["user"]
    access_token?: string
    error?: string
  }

  interface User {
    id: string
    org_id?: string
    role?: string
    permissions?: string[]
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }
}

declare module "next-auth/jwt" {
  /** Returned by the `jwt` callback and `getToken`, when using JWT sessions */
  interface JWT {
    id: string
    org_id?: string
    role?: string
    permissions?: string[]
    access_token?: string
    refresh_token?: string
    expires_at?: number
    error?: string
  }
}
