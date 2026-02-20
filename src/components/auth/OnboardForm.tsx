"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { getBackendUrl } from "@/lib/origin"

export function OnboardForm() {
  const router = useRouter()
  const { data: session, update } = useSession()
  const [orgName, setOrgName] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const backendUrl = getBackendUrl()
      const res = await fetch(`${backendUrl}/api/v1/auth/onboard`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          action: "create_org",
          org_name: orgName || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.detail || "Failed to create workspace")
        return
      }

      await update({
        onboardComplete: {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          org_id: data.org_id,
          role: data.role,
          expires_in: data.expires_in,
        },
      })

      router.push("/")
      router.refresh()
    } catch {
      toast.error("An error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-sm">
      <div className="space-y-2">
        <label
          htmlFor="orgName"
          className="block text-sm font-medium text-[var(--foreground)]"
        >
          Organization Name
        </label>
        <input
          id="orgName"
          type="text"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          className="w-full px-3 py-2 border rounded-md border-[var(--card-stroke)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          placeholder="My Company"
        />
        <p className="text-xs text-[var(--ink-muted)]">
          Leave blank to use &quot;My Organization&quot;
        </p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 px-4 bg-[var(--accent)] text-white rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 font-medium"
      >
        {loading ? "Creating workspace..." : "Create Workspace"}
      </button>
    </form>
  )
}
