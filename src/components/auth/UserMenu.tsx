"use client"

import { useSession, signOut } from "next-auth/react"
import Link from "next/link"
import { useState, useRef, useEffect } from "react"
import { runtimeConfig } from "@/lib/runtimeConfig"

function SettingsButton() {
  return (
    <Link
      href="/admin/settings"
      className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--card-stroke)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--card-80)] transition-colors"
      aria-label="Settings"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </Link>
  )
}

function AuthEnabledMenu() {
  const { data: session, status } = useSession()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  if (status === "loading") {
    return <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--card-stroke)]" />
  }

  if (!session) {
    return (
      <Link
        href="/auth/signin"
        className="text-sm font-medium text-[var(--foreground)] hover:text-[var(--accent)] transition-colors"
      >
        Sign In
      </Link>
    )
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-full border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-1.5 hover:bg-[var(--card-80)] transition-colors"
      >
        <div className="h-6 w-6 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-xs font-bold">
          {session.user?.email?.[0]?.toUpperCase() || "U"}
        </div>
        <span className="text-sm font-medium text-[var(--foreground)] hidden sm:block">
          {session.user?.email?.split("@")[0]}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 origin-top-right rounded-md border border-[var(--card-stroke)] bg-[var(--card)] shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          <div className="py-1">
            <div className="px-4 py-2 text-xs text-[var(--ink-muted)] border-b border-[var(--card-stroke)]">
              Signed in as<br />
              <span className="font-medium text-[var(--foreground)] truncate block">
                {session.user?.email}
              </span>
            </div>
            <Link
              href="/admin"
              className="block px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--card-80)]"
              onClick={() => setIsOpen(false)}
            >
              Admin Panel
            </Link>
            <Link
              href="/admin/settings"
              className="block px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--card-80)]"
              onClick={() => setIsOpen(false)}
            >
              Settings
            </Link>
            <div className="border-t border-[var(--card-stroke)]">
              <button
                onClick={() => signOut()}
                className="block w-full px-4 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--card-80)]"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function UserMenu() {
  if (!runtimeConfig.authEnabled()) {
    return <SettingsButton />
  }
  return <AuthEnabledMenu />
}
