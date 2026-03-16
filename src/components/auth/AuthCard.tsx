"use client"

import { AuthTabs } from "./AuthTabs"

type AuthCardProps = {
  children: React.ReactNode
  signInHref?: string
  signUpHref?: string
}

export function AuthCard({ children, signInHref, signUpHref }: AuthCardProps) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-[var(--card-stroke)] bg-[var(--card)] p-6 sm:p-8 shadow-lg space-y-6">
      <AuthTabs signInHref={signInHref} signUpHref={signUpHref} />

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-[var(--card-stroke)]" />
        <span className="text-sm text-[var(--ink-muted)]">continue with email</span>
        <div className="h-px flex-1 bg-[var(--card-stroke)]" />
      </div>

      {children}
    </div>
  )
}
