"use client"

import { useSession, signOut } from "next-auth/react"
import Link from "next/link"
import { useState, useRef, useEffect, useSyncExternalStore } from "react"
import { runtimeConfig } from "@/lib/runtimeConfig"
import { isServer, getLocalStorage, getWindow } from "@/lib/env"

type Theme = "light" | "dark"
type Listener = () => void

const themeListeners = new Set<Listener>()

const subscribeTheme = (listener: Listener) => {
  themeListeners.add(listener)
  return () => themeListeners.delete(listener)
}

const notifyTheme = () => {
  themeListeners.forEach((listener) => listener())
}

const getStoredTheme = (): Theme | null => {
  const stored = getLocalStorage()?.getItem("theme")
  return stored === "light" || stored === "dark" ? stored : null
}

const getSystemTheme = (): Theme => {
  const win = getWindow()
  if (!win) return "light"
  return win.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

const applyTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  localStorage.setItem("theme", theme)
  notifyTheme()
}

const getThemeSnapshot = (): Theme => {
  if (isServer) return "light"
  const stored = getStoredTheme()
  if (stored) return stored
  const fromDataset = document.documentElement.dataset.theme
  if (fromDataset === "light" || fromDataset === "dark") return fromDataset
  return getSystemTheme()
}

const getThemeServerSnapshot = (): Theme => "light"

function ThemeToggleButton() {
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getThemeServerSnapshot)

  const handleToggle = () => {
    if (isServer) return
    const nextTheme = theme === "dark" ? "light" : "dark"
    applyTheme(nextTheme)
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      className="flex w-full items-center justify-between px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--card-80)]"
    >
      <span>Theme</span>
      <span className="text-xs text-[var(--ink-muted)]">
        {theme === "dark" ? "Dark" : "Light"}
      </span>
    </button>
  )
}

function AuthDisabledMenu() {
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

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-full border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-1.5 hover:bg-[var(--card-80)] transition-colors"
      >
        <div className="h-6 w-6 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-xs font-bold">
          U
        </div>
        <span className="text-sm font-medium text-[var(--foreground)] hidden sm:block">
          Menu
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 origin-top-right rounded-md border border-[var(--card-stroke)] bg-[var(--card)] shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          <div className="py-1">
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
              <ThemeToggleButton />
            </div>
          </div>
        </div>
      )}
    </div>
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
              <ThemeToggleButton />
            </div>
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
    return <AuthDisabledMenu />
  }
  return <AuthEnabledMenu />
}
