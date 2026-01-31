"use client"

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react"
import { runtimeConfig } from "@/lib/runtimeConfig"

export function SessionProvider({ children }: { children: React.ReactNode }) {
  if (!runtimeConfig.authEnabled()) {
    return <>{children}</>
  }
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>
}
