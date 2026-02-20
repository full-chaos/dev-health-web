"use client"

import { useSession, signOut } from "next-auth/react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { useState, useRef, useEffect } from "react"

export function UserMenu() {
  const { data: session, status } = useSession()
  const pathname = usePathname()
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

  // Don't render on auth pages (sign-in, sign-up) — the server-side session
  // may be invalidated while the client-side useSession() still has stale data.
  if (pathname?.startsWith("/auth/")) {
    return null
  }

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
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="cursor-pointer flex items-center gap-2 rounded-full border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-1.5 hover:bg-[var(--card-80)] transition-colors"
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
            {session.user?.is_superuser && (
              <Link
                href="/superadmin"
                className="cursor-pointer block px-4 py-2 text-sm text-purple-400 hover:bg-[var(--card-80)]"
                onClick={() => setIsOpen(false)}
              >
                Platform Admin
              </Link>
            )}
            <Link
              href="/admin"
              className="cursor-pointer block px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--card-80)]"
              onClick={() => setIsOpen(false)}
            >
              Admin Panel
            </Link>
            <Link
              href="/admin/settings"
              className="cursor-pointer block px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--card-80)]"
              onClick={() => setIsOpen(false)}
            >
              Settings
            </Link>
            <div className="border-t border-[var(--card-stroke)]">
              <button
                type="button"
                onClick={() => signOut()}
                className="cursor-pointer block w-full px-4 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--card-80)]"
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
